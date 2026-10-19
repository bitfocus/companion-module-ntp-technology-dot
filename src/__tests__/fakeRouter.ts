import { createServer, type Server, type Socket } from 'node:net'

/**
 * A DOT router controller on a loopback TCP port, for the module to connect to.
 *
 * There is no protocol document or device capture to work from. The replies are in the formats the 1.x module parsed,
 * and which it was tested against hardware with: an AckSet echoing the request's parameters and address, a crosspoint
 * notification without an address, and a NotificationReply to each notification request. Everything here is written
 * out by hand rather than taken from the module under test.
 */
export class FakeRouter {
	/** Every line received, in order */
	readonly received: { at: number; connection: number; text: string }[] = []
	/** performance.now() of each reply sent */
	readonly replies: number[] = []
	readonly crosspoints = new Map<number, number>()
	readonly gains = new Map<number, number>()
	readonly p48 = new Map<number, number>()
	readonly delays = new Map<number, number>()
	port = 0
	/** Connections accepted so far */
	connections = 0
	/** Delay before each reply */
	replyDelay = 0
	/** Off, the socket stays open but nothing is answered, as when the router hangs or a cable is pulled mid-path */
	answering = true
	/** Whether the alive notification request, which is the keepalive, is answered */
	answersKeepalive = true
	readonly #server: Server
	readonly #sockets = new Set<Socket>()
	/** Connections that have asked for crosspoint notifications */
	readonly #notified = new Set<Socket>()
	readonly #buffers = new Map<Socket, string>()
	readonly #timers = new Set<NodeJS.Timeout>()

	constructor() {
		this.#server = createServer((socket) => {
			this.connections++
			const connection = this.connections
			this.#sockets.add(socket)
			this.#buffers.set(socket, '')
			socket.on('data', (chunk: Buffer) => this.#onData(socket, connection, chunk))
			socket.on('close', () => {
				this.#sockets.delete(socket)
				this.#notified.delete(socket)
				this.#buffers.delete(socket)
			})
			socket.on('error', () => {})
		})
	}

	async listen(port = 0): Promise<void> {
		await new Promise<void>((resolve) => this.#server.listen(port, '127.0.0.1', resolve))
		const address = this.#server.address()
		if (!address || typeof address === 'string') throw new Error('fake router did not get a port')
		this.port = address.port
	}

	async close(): Promise<void> {
		for (const timer of this.#timers) clearTimeout(timer)
		this.dropConnections()
		await new Promise<void>((resolve) => this.#server.close(() => resolve()))
	}

	get openConnections(): number {
		return this.#sockets.size
	}

	/** Closes every connection from the router's end */
	dropConnections(): void {
		for (const socket of this.#sockets) socket.destroy()
	}

	/** Writes to every connection, as is */
	broadcastRaw(data: string | Uint8Array): void {
		for (const socket of this.#sockets) socket.write(data)
	}

	/** Writes a line to every connection */
	broadcast(text: string): void {
		this.broadcastRaw(text + '\r')
	}

	/** The text of every line received, optionally only those on one connection */
	texts(connection?: number): string[] {
		return this.received.filter((m) => connection === undefined || m.connection === connection).map((m) => m.text)
	}

	/** The destinations interrogated, in order */
	interrogated(): number[] {
		return this.texts()
			.map((text) => /^\.IC(\d+),-\*XPOINT$/.exec(text))
			.filter((match) => match !== null)
			.map((match) => Number(match[1]))
	}

	/** The crosspoints set, in order */
	routed(): { destination: number; source: number }[] {
		return this.texts()
			.map((text) => /^\.SC(\d+),(\d+)\*XPOINT$/.exec(text))
			.filter((match) => match !== null)
			.map((match) => ({ destination: Number(match[1]), source: Number(match[2]) }))
	}

	#onData(socket: Socket, connection: number, chunk: Buffer): void {
		let buffer = (this.#buffers.get(socket) ?? '') + chunk.toString('latin1')
		let end: number
		while ((end = buffer.indexOf('\r')) !== -1) {
			const text = buffer.slice(0, end)
			buffer = buffer.slice(end + 1)
			this.received.push({ at: performance.now(), connection, text })
			this.#answer(socket, text)
		}
		this.#buffers.set(socket, buffer)
	}

	#answer(socket: Socket, text: string): void {
		if (text === 'exit') {
			socket.end()
			return
		}
		if (!this.answering) return
		const reply = (line: string, to: Iterable<Socket> = [socket]) => {
			const send = () => {
				this.replies.push(performance.now())
				for (const s of to) if (!s.destroyed) s.write(line + '\r')
			}
			if (this.replyDelay === 0) {
				send()
				return
			}
			const timer = setTimeout(() => {
				this.#timers.delete(timer)
				send()
			}, this.replyDelay)
			this.#timers.add(timer)
		}

		let match: RegExpExecArray | null
		if ((match = /^\.SC(\d+),(\d+)\*XPOINT$/.exec(text))) {
			const [, dst, src] = match
			this.crosspoints.set(Number(dst), Number(src))
			reply(`.AC${dst},${src}*XPOINT`)
			reply(`.NC${dst},${src}`, [...this.#notified])
		} else if ((match = /^\.IC(\d+),-\*XPOINT$/.exec(text))) {
			const dst = Number(match[1])
			reply(`.AC${dst},${this.crosspoints.get(dst) ?? 0}*XPOINT`)
		} else if ((match = /^\.([GPD])C(\d+),(\d+)\*(GAIN|P48|DELAY)$/.exec(text))) {
			const [, control, src, value, address] = match
			const store = { G: this.gains, P: this.p48, D: this.delays }[control as 'G' | 'P' | 'D']
			store.set(Number(src), Number(value))
			reply(`.AC${src},${value}*${address}`)
		} else if (text === '.ZC1,1') {
			this.#notified.add(socket)
			reply('.QC1,1')
		} else if (text === '.ZZ1,0') {
			if (this.answersKeepalive) reply('.QZ1,0')
		} else if (text === '.ZA1,1') {
			reply('.QA1,1')
		} else {
			reply(`.E${text.slice(1)}`)
		}
	}
}

/** A port nothing is listening on */
export async function closedPort(): Promise<number> {
	const router = new FakeRouter()
	await router.listen()
	const { port } = router
	await router.close()
	return port
}
