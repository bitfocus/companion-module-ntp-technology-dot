import { EventEmitter } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { InstanceStatus, TCPHelper, type LogLevel } from '@companion-module/base'
import PQueue from 'p-queue'
import {
	ACK_TIMEOUT_MS,
	CONNECT_TIMEOUT_MS,
	END_SESSION,
	EOM,
	KEEPALIVE_INTERVAL_MS,
	KEEPALIVE_TIMEOUT_MS,
	MESSAGE_GAP_MS,
	Priority,
	RECONNECT_INTERVAL_MS,
} from './consts.js'
import {
	alarmNotificationRequest,
	aliveNotificationRequest,
	crosspointNotificationRequest,
	type Message,
} from './messages.js'
import { decodeLine, LineReader, type AlarmResponse, type CrosspointResponse } from './responses.js'
import { errorMessage, unhandledOption } from '../util.js'

export interface RouterTiming {
	/** Least time from sending one message to sending the next */
	messageGap: number
	/** Longest wait for a reply before sending the next message anyway */
	ackTimeout: number
	keepaliveInterval: number
	/** How long a router known to answer the keepalive has to answer it again */
	keepaliveTimeout: number
	reconnectInterval: number
	/** How long a connection attempt may take */
	connectTimeout: number
}

export const DEFAULT_TIMING: RouterTiming = {
	messageGap: MESSAGE_GAP_MS,
	ackTimeout: ACK_TIMEOUT_MS,
	keepaliveInterval: KEEPALIVE_INTERVAL_MS,
	keepaliveTimeout: KEEPALIVE_TIMEOUT_MS,
	reconnectInterval: RECONNECT_INTERVAL_MS,
	connectTimeout: CONNECT_TIMEOUT_MS,
}

export interface Endpoint {
	host: string
	port: number
}

export type Controller = 'Primary' | 'Secondary'

export interface RouterOptions {
	primary: Endpoint
	/** Set for redundant controllers. Each time a connection fails or closes, the next attempt is to the other one */
	secondary?: Endpoint
	log: (level: LogLevel, message: string) => void
	/** Defaults to {@link DEFAULT_TIMING}. Tests shorten it */
	timing?: Partial<RouterTiming>
}

export interface RouterEvents {
	/** A connection has opened. Fires again on every reconnection */
	connected: [controller: Controller]
	/** The open connection has closed or failed. Another attempt follows */
	disconnected: []
	crosspoint: [response: CrosspointResponse]
	alarm: [response: AlarmResponse]
	status: [status: InstanceStatus, message: string | null]
}

/** One send of a message that has been merged with others, or may yet be */
interface Sender {
	readonly message: Message
	readonly resolve: () => void
	readonly reject: (reason: unknown) => void
}

/** A message queued once for every send merged with it, by {@link Message.key} */
interface WaitingMessage {
	readonly key: string
	/** The queue's id for the job, to change its priority by */
	readonly id: string
	priority: Priority
	/** In the order sent. The newest one's text is the one that goes */
	readonly senders: Sender[]
	/** Aborted once every sender has been, which drops the job */
	readonly controller: AbortController
	/** Set once the queue has started the job, after which its priority can't be changed */
	started: boolean
}

/** Resolves true if the promise settles within the time, false if not */
async function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
	let timer: NodeJS.Timeout | undefined
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), ms)
	})
	try {
		return await Promise.race([promise.then(() => true), timeout])
	} finally {
		clearTimeout(timer)
	}
}

/**
 * The TCP connection to a DOT router controller, or a redundant pair of them: framing, pacing, keepalive, reconnection
 * and failover. Knows nothing of Companion beyond reporting a status for it.
 */
export class RouterConnection extends EventEmitter<RouterEvents> {
	readonly #options: RouterOptions
	readonly #timing: RouterTiming
	readonly #queue = new PQueue({ concurrency: 1 })
	readonly #reader = new LineReader()
	/** Messages not yet sent that later ones may be merged with, by {@link Message.key} */
	readonly #waiting = new Map<string, WaitingMessage>()
	/** Makes each waiting message's queue id unique. The queue's own are '1', '2' and so on, so these must not be */
	#waitingCount = 0
	#controller: Controller = 'Primary'
	#socket: TCPHelper | undefined
	/** Exists while a connection is open, and is aborted as it closes, which drops everything queued for it */
	#session: AbortController | undefined
	/** Settles once the router may be sent the next message */
	#lineClear: Promise<void> = Promise.resolve()
	/** Ends the wait for a reply to the last message sent */
	#replied: (() => void) | undefined
	#connectTimer: NodeJS.Timeout | undefined
	#reconnectTimer: NodeJS.Timeout | undefined
	#keepaliveTimer: NodeJS.Timeout | undefined
	#watchdogTimer: NodeJS.Timeout | undefined
	/** Counts chunks received, so the watchdog can tell whether anything has arrived since a keepalive was queued */
	#received = 0
	#answersKeepalive = false
	/** Set by the first failure of an outage, so retries against a router that is off don't flood the log */
	#outageLogged = false
	#lastStatus: { status: InstanceStatus; message: string | null } | undefined
	#destroyed = false

	constructor(options: RouterOptions) {
		super()
		this.#options = options
		this.#timing = { ...DEFAULT_TIMING, ...options.timing }
	}

	get isConnected(): boolean {
		return this.#session !== undefined
	}

	/** The controller connected to, or being tried */
	get controller(): Controller {
		return this.#controller
	}

	/** Opens the connection to the primary, replacing any already open. After that, it reconnects by itself */
	connect(): void {
		if (this.#destroyed) throw new Error('Router connection has been destroyed')
		this.#controller = 'Primary'
		this.#attempt()
	}

	/** Ends the session and closes the connection for good. Anything still queued is rejected */
	destroy(): void {
		this.#destroyed = true
		this.removeAllListeners()
		const socket = this.#socket
		if (socket?.isConnected) {
			// Straight to the socket, past the queue: nothing else will be sent
			try {
				socket.send(END_SESSION + EOM)
			} catch (err) {
				this.#options.log('debug', `Could not end session: ${errorMessage(err)}`)
			}
		}
		this.#closeSocket()
	}

	/**
	 * Queues a message for the router, merged with one of the same key still waiting if there is one. That keeps its
	 * place in the queue, and moves up to this one's priority if that is higher. See {@link Message.key}
	 * @param signal an action's context.signal. A message whose signal aborts before its turn is never sent. A merged
	 * message goes unless every send merged into it aborts
	 * @returns once the message is written to the socket, or the one it was merged with is
	 * @throws if there is no connection, or it closes or the signal aborts before the message is sent
	 */
	async send(message: Message, priority: Priority = Priority.Background, signal?: AbortSignal): Promise<void> {
		const session = this.#session
		if (session === undefined) throw new Error('Not connected to router')
		signal?.throwIfAborted()
		const { promise, resolve, reject } = Promise.withResolvers<void>()
		const sender: Sender = { message, resolve, reject }
		let waiting = this.#waiting.get(message.key)
		const merged = waiting !== undefined
		if (waiting === undefined) {
			waiting = {
				key: message.key,
				id: `${message.key} #${++this.#waitingCount}`,
				priority,
				senders: [],
				controller: new AbortController(),
				started: false,
			}
			this.#waiting.set(message.key, waiting)
		} else {
			this.#options.log('debug', `Merged ${message.text} with the ${message.key} already waiting`)
			if (priority > waiting.priority && !waiting.started) {
				this.#queue.setPriority(waiting.id, priority)
				waiting.priority = priority
			}
		}
		waiting.senders.push(sender)
		if (signal) {
			const entry = waiting
			const onAbort = () => this.#abandon(entry, sender, signal.reason)
			signal.addEventListener('abort', onAbort, { once: true })
			const stopListening = () => signal.removeEventListener('abort', onAbort)
			promise.then(stopListening, stopListening)
		}
		if (!merged) this.#queueWaiting(waiting, session)
		await promise
	}

	/**
	 * Waits for the router to report the source on a destination, as the reply to an interrogate does
	 * @returns the source, or undefined if none is reported within the timeout
	 */
	async waitForCrosspoint(destination: number, timeout: number, signal?: AbortSignal): Promise<number | undefined> {
		signal?.throwIfAborted()
		return new Promise<number | undefined>((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timer)
				this.off('crosspoint', onCrosspoint)
				signal?.removeEventListener('abort', onAbort)
			}
			const onCrosspoint = (response: CrosspointResponse) => {
				if (response.destination !== destination) return
				cleanup()
				resolve(response.source)
			}
			const onAbort = () => {
				cleanup()
				const reason: unknown = signal?.reason
				reject(reason instanceof Error ? reason : new Error(`Aborted: ${String(reason)}`))
			}
			const timer = setTimeout(() => {
				cleanup()
				resolve(undefined)
			}, timeout)
			this.on('crosspoint', onCrosspoint)
			signal?.addEventListener('abort', onAbort, { once: true })
		})
	}

	#queueWaiting(waiting: WaitingMessage, session: AbortController): void {
		// p-queue listens on the combined signal from the moment the job is queued, which makes it pass an abort on
		// eagerly. Only reading .aborted could miss one: AbortSignal.any holds its sources weakly
		const signal = AbortSignal.any([session.signal, waiting.controller.signal])
		this.#queue
			.add(
				async ({ signal: jobSignal }) => {
					waiting.started = true
					await this.#transmit(() => this.#take(waiting), jobSignal)
				},
				{ id: waiting.id, priority: waiting.priority, signal },
			)
			.then(
				() => {
					for (const sender of this.#finish(waiting)) sender.resolve()
				},
				(err: unknown) => {
					for (const sender of this.#finish(waiting)) sender.reject(err)
				},
			)
	}

	/** The text to send for a waiting message, taken just before it goes, after which nothing more is merged with it */
	#take(waiting: WaitingMessage): string {
		this.#forget(waiting)
		const newest = waiting.senders.at(-1)
		// The job's signal aborts with the last sender, so this can't happen
		if (newest === undefined) throw new Error('Every send of the message has been aborted')
		return newest.message.text
	}

	/** Drops a sender whose signal has aborted. The message is still sent for any others, or dropped if there are none */
	#abandon(waiting: WaitingMessage, sender: Sender, reason: unknown): void {
		const index = waiting.senders.indexOf(sender)
		if (index === -1) return
		waiting.senders.splice(index, 1)
		sender.reject(reason)
		if (waiting.senders.length > 0) return
		this.#forget(waiting)
		waiting.controller.abort(reason)
	}

	/** Once a waiting message's job has settled: the senders still to be told how it went */
	#finish(waiting: WaitingMessage): Sender[] {
		this.#forget(waiting)
		return waiting.senders.splice(0)
	}

	#forget(waiting: WaitingMessage): void {
		if (this.#waiting.get(waiting.key) === waiting) this.#waiting.delete(waiting.key)
	}

	/**
	 * @param take gives the text to send. It is called only once the line is clear, so a message that something was
	 * merged with while it waited goes as it now stands
	 */
	async #transmit(take: () => string, signal: AbortSignal | undefined): Promise<void> {
		// The wait is here, at the start of a job, rather than at the end of the one before. p-queue starts the next job as
		// soon as a running job's signal aborts, and the router must still get its gap and its chance to reply
		await this.#lineClear
		signal?.throwIfAborted()
		const socket = this.#socket
		if (!socket?.isConnected) throw new Error('Not connected to router')
		const text = take()
		this.#holdLine()
		this.#options.log('debug', `Sending ${text}`)
		try {
			if (!(await socket.sendAsync(text + EOM))) throw new Error('Not connected to router')
		} catch (err) {
			// No reply is coming to a message that never went
			this.#releaseLine()
			throw err
		}
	}

	/** Called just before a message goes, so a reply can't arrive before anything is waiting for it */
	#holdLine(): void {
		const replied = new Promise<void>((resolve) => {
			this.#replied = resolve
		})
		const { messageGap, ackTimeout } = this.#timing
		this.#lineClear = Promise.all([
			sleep(messageGap),
			settlesWithin(replied, ackTimeout).then((didReply) => {
				if (!didReply) this.#options.log('debug', `No reply within ${ackTimeout} ms, sending on`)
			}),
		]).then(() => undefined)
	}

	#releaseLine(): void {
		this.#replied?.()
		this.#replied = undefined
	}

	#endpoint(): Endpoint {
		const { primary, secondary } = this.#options
		return this.#controller === 'Secondary' && secondary ? secondary : primary
	}

	/** Opens a new socket to the current controller, replacing any there is */
	#attempt(): void {
		this.#closeSocket()
		const controller = this.#controller
		const { host, port } = this.#endpoint()
		this.#options.log('debug', `Connecting to ${controller} ${host}:${port}`)
		// During an outage the status stays at the failure, rather than flicking back to connecting every retry
		if (!this.#outageLogged) this.#status(InstanceStatus.Connecting, `Connecting to ${controller}`)
		// Reconnection is done here rather than by TCPHelper, so that it can alternate between controllers
		const socket = new TCPHelper(host, port, { reconnect: false })
		this.#socket = socket
		this.#connectTimer = setTimeout(() => {
			this.#fail(socket, `No connection to ${controller} ${host}:${port} within ${this.#timing.connectTimeout} ms`)
		}, this.#timing.connectTimeout)
		socket.on('connect', () => this.#open(socket))
		socket.on('data', (chunk) => this.#receive(chunk))
		socket.on('end', () => this.#fail(socket, `Connection closed by ${controller}`, InstanceStatus.Disconnected))
		socket.on('error', (err) => this.#fail(socket, `Network error: ${err.message}`))
	}

	/** Closes a socket that has failed or closed, and tries again after the reconnect interval */
	#fail(socket: TCPHelper, message: string, status = InstanceStatus.ConnectionFailure): void {
		// TCPHelper's destroy removes its listeners, so this guards only against a timer racing a replacement
		if (socket !== this.#socket || this.#destroyed) return
		this.#closeSocket()
		this.#status(status, message)
		this.#logOutage(status === InstanceStatus.Disconnected ? 'warn' : 'error', message)
		if (this.#options.secondary) {
			this.#controller = this.#controller === 'Primary' ? 'Secondary' : 'Primary'
			this.#options.log('debug', `Trying ${this.#controller} next`)
		}
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = undefined
			this.#attempt()
		}, this.#timing.reconnectInterval)
	}

	#open(socket: TCPHelper): void {
		if (socket !== this.#socket) return
		clearTimeout(this.#connectTimer)
		this.#connectTimer = undefined
		this.#close()
		const controller = this.#controller
		const { host, port } = this.#endpoint()
		this.#session = new AbortController()
		this.#reader.reset()
		this.#lineClear = Promise.resolve()
		this.#answersKeepalive = false
		this.#outageLogged = false
		this.#options.log('info', `Connected on ${controller} ${host}:${port}`)
		this.#status(InstanceStatus.Ok, `Connected to ${controller}`)
		this.#sendInBackground(crosspointNotificationRequest())
		this.#sendInBackground(aliveNotificationRequest())
		this.#sendInBackground(alarmNotificationRequest())
		this.#scheduleKeepalive()
		this.emit('connected', controller)
	}

	/** Ends the session, if one is open: everything queued for it is rejected, and its timers stopped */
	#close(): void {
		const session = this.#session
		if (session === undefined) return
		this.#session = undefined
		clearTimeout(this.#keepaliveTimer)
		this.#keepaliveTimer = undefined
		clearTimeout(this.#watchdogTimer)
		this.#watchdogTimer = undefined
		session.abort(new Error('Connection to router closed'))
		this.#releaseLine()
		this.#lineClear = Promise.resolve()
		this.#reader.reset()
		this.emit('disconnected')
	}

	#closeSocket(): void {
		this.#close()
		clearTimeout(this.#connectTimer)
		this.#connectTimer = undefined
		clearTimeout(this.#reconnectTimer)
		this.#reconnectTimer = undefined
		// TCPHelper's destroy removes its listeners first, so the old socket can't report anything once replaced
		this.#socket?.destroy()
		this.#socket = undefined
	}

	#receive(chunk: Buffer): void {
		this.#received++
		clearTimeout(this.#watchdogTimer)
		this.#watchdogTimer = undefined
		// Any message from the router shows it is ready for the next one, as the 1.x module had it
		this.#releaseLine()
		const { lines, discarded } = this.#reader.push(chunk)
		if (discarded > 0) this.#options.log('warn', `Discarded ${discarded} bytes with no end of message`)
		for (const line of lines) this.#handleLine(line)
	}

	#handleLine(line: string): void {
		try {
			const decoded = decodeLine(line)
			if (decoded === undefined) return
			this.#options.log(decoded.level, decoded.message)
			const { response } = decoded
			switch (response.type) {
				case 'crosspoint':
					this.emit('crosspoint', response)
					break
				case 'alarm':
					this.emit('alarm', response)
					break
				case 'alive':
					this.#answersKeepalive = true
					break
				case 'other':
					break
				default:
					unhandledOption(response, undefined)
			}
		} catch (err) {
			// This runs in the socket's data listener, where a throw would end the module's process
			this.#options.log('error', `Could not handle message ${JSON.stringify(line)}: ${errorMessage(err)}`)
		}
	}

	#scheduleKeepalive(): void {
		clearTimeout(this.#keepaliveTimer)
		this.#keepaliveTimer = setTimeout(() => this.#keepalive(), this.#timing.keepaliveInterval)
	}

	#keepalive(): void {
		this.#keepaliveTimer = undefined
		const session = this.#session
		const socket = this.#socket
		if (session === undefined || socket === undefined) return
		// Only a router known to answer is watched. One that never does would otherwise be reconnected every interval
		const watch = this.#answersKeepalive
		const receivedBefore = this.#received
		const message = aliveNotificationRequest()
		this.send(message).then(
			() => {
				if (!watch || this.#session !== session || this.#received !== receivedBefore) return
				clearTimeout(this.#watchdogTimer)
				this.#watchdogTimer = setTimeout(() => {
					this.#watchdogTimer = undefined
					this.#fail(socket, `No reply to keepalive within ${this.#timing.keepaliveTimeout} ms, reconnecting`)
				}, this.#timing.keepaliveTimeout)
			},
			(err: unknown) => this.#options.log('debug', `Not sent ${message.text}: ${errorMessage(err)}`),
		)
		this.#scheduleKeepalive()
	}

	/** For messages nothing waits on. Their only failure is the connection closing, which is reported already */
	#sendInBackground(message: Message): void {
		this.send(message).catch((err) => this.#options.log('debug', `Not sent ${message.text}: ${errorMessage(err)}`))
	}

	#status(status: InstanceStatus, message: string | null): void {
		if (this.#lastStatus?.status === status && this.#lastStatus.message === message) return
		this.#lastStatus = { status, message }
		this.emit('status', status, message)
	}

	#logOutage(level: LogLevel, message: string): void {
		this.#options.log(this.#outageLogged ? 'debug' : level, message)
		this.#outageLogged = true
	}
}
