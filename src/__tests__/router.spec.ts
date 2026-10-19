import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { InstanceStatus, type LogLevel, type TCPHelperOptions } from '@companion-module/base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	aliveNotificationRequest,
	interrogateCrosspoint,
	Priority,
	RouterConnection,
	setCrosspoint,
	setGain,
	type CrosspointResponse,
	type Endpoint,
	type RouterTiming,
} from '../api/index.js'
import { closedPort, FakeRouter } from './fakeRouter.js'

/** A host whose connection attempts neither open nor fail, as a controller that is off can leave them for minutes */
const BLACKHOLE = 'blackhole.test'

vi.mock('@companion-module/base', async (importOriginal) => {
	const base = await importOriginal<typeof import('@companion-module/base')>()
	class TCPHelper extends base.TCPHelper {
		readonly #blackhole: boolean
		constructor(host: string, port: number, options?: TCPHelperOptions) {
			super(host, port, options)
			this.#blackhole = host === BLACKHOLE
		}
		override connect(): boolean {
			return this.#blackhole ? true : super.connect()
		}
	}
	return { ...base, TCPHelper }
})

/** Short enough to keep the tests quick, with each wait still distinct from the others */
const TIMING: RouterTiming = {
	messageGap: 10,
	ackTimeout: 200,
	keepaliveInterval: 60_000,
	keepaliveTimeout: 10_000,
	reconnectInterval: 50,
	connectTimeout: 300,
}

let fake: FakeRouter
const routers: RouterConnection[] = []
const extraRouters: FakeRouter[] = []

beforeEach(async () => {
	fake = new FakeRouter()
	await fake.listen()
})

afterEach(async () => {
	for (const router of routers.splice(0)) router.destroy()
	await fake.close()
	for (const extra of extraRouters.splice(0)) await extra.close()
})

interface CreateOptions {
	timing?: Partial<RouterTiming>
	primary?: Endpoint
	secondary?: Endpoint
}

function createRouter(options: CreateOptions = {}) {
	const log = vi.fn<(level: LogLevel, message: string) => void>()
	const router = new RouterConnection({
		primary: options.primary ?? { host: '127.0.0.1', port: fake.port },
		secondary: options.secondary,
		log,
		timing: { ...TIMING, ...options.timing },
	})
	const statuses: [InstanceStatus, string | null][] = []
	router.on('status', (status, message) => statuses.push([status, message]))
	const crosspoints: CrosspointResponse[] = []
	router.on('crosspoint', (response) => crosspoints.push(response))
	routers.push(router)
	return { router, log, statuses, crosspoints }
}

/** Connects, and waits for the queries sent on connecting to go and be answered, so tests start from a quiet line */
async function connected(options: CreateOptions = {}) {
	const created = createRouter(options)
	const opened = once(created.router, 'connected')
	created.router.connect()
	await opened
	await vi.waitFor(() => expect(fake.received).toHaveLength(3))
	await sleep(fake.answersKeepalive ? 50 : TIMING.ackTimeout + 50)
	fake.received.length = 0
	fake.replies.length = 0
	created.log.mockClear()
	return created
}

const logged = (log: ReturnType<typeof createRouter>['log'], level: LogLevel, pattern: RegExp) =>
	log.mock.calls.filter(([l, message]) => l === level && pattern.test(message))

describe('connecting', () => {
	it('asks for crosspoint, alive and alarm notifications, in that order', async () => {
		const { router, statuses } = createRouter()
		const opened = once(router, 'connected')
		router.connect()
		await expect(opened).resolves.toEqual(['Primary'])
		await vi.waitFor(() => expect(fake.texts()).toEqual(['.ZC1,1', '.ZZ1,0', '.ZA1,1']))
		expect(statuses).toEqual([
			[InstanceStatus.Connecting, 'Connecting to Primary'],
			[InstanceStatus.Ok, 'Connected to Primary'],
		])
	})

	it('retries a refused connection, logging the outage and showing it as the status once', async () => {
		const port = await closedPort()
		const { router, log, statuses } = createRouter({ primary: { host: '127.0.0.1', port } })
		router.connect()
		await vi.waitFor(() => expect(logged(log, 'debug', /Network error/).length).toBeGreaterThanOrEqual(2))
		expect(logged(log, 'error', /Network error/)).toHaveLength(1)
		expect(logged(log, 'debug', /^Connecting to Primary/).length).toBeGreaterThanOrEqual(3)
		expect(statuses).toEqual([
			[InstanceStatus.Connecting, 'Connecting to Primary'],
			[InstanceStatus.ConnectionFailure, expect.stringMatching(/Network error/)],
		])
		expect(router.isConnected).toBe(false)
	})

	it('reconnects when the router drops the connection, and asks for notifications again', async () => {
		const { router, statuses } = await connected()
		fake.dropConnections()
		await vi.waitFor(() => expect(fake.connections).toBe(2))
		await vi.waitFor(() => expect(fake.texts(2)).toEqual(['.ZC1,1', '.ZZ1,0', '.ZA1,1']))
		expect(router.isConnected).toBe(true)
		expect(statuses.at(-1)).toEqual([InstanceStatus.Ok, 'Connected to Primary'])
	})

	it('reports the router closing the connection as a disconnection', async () => {
		const { statuses } = await connected()
		const disconnected = vi.fn()
		routers[0].on('disconnected', disconnected)
		fake.dropConnections()
		await vi.waitFor(() => expect(disconnected).toHaveBeenCalled())
		expect(statuses).toContainEqual([InstanceStatus.Disconnected, 'Connection closed by Primary'])
	})

	it('gives up on a connection attempt that takes too long, and tries again', async () => {
		const { router, log, statuses } = createRouter({ primary: { host: BLACKHOLE, port: 1 } })
		router.connect()
		await vi.waitFor(() => expect(statuses).toContainEqual([InstanceStatus.ConnectionFailure, expect.anything()]), {
			timeout: TIMING.connectTimeout + 200,
		})
		expect(logged(log, 'error', /No connection to Primary blackhole.test:1 within 300 ms/)).toHaveLength(1)
		await vi.waitFor(() => expect(logged(log, 'debug', /^Connecting to Primary blackhole.test:1$/)).toHaveLength(2), {
			timeout: TIMING.connectTimeout + 500,
		})
	})
})

describe('redundant controllers', () => {
	async function secondaryRouter() {
		const secondary = new FakeRouter()
		await secondary.listen()
		extraRouters.push(secondary)
		return secondary
	}

	it('connects to the secondary when the primary refuses', async () => {
		const secondary = await secondaryRouter()
		const port = await closedPort()
		const { router, statuses } = createRouter({
			primary: { host: '127.0.0.1', port },
			secondary: { host: '127.0.0.1', port: secondary.port },
		})
		const opened = once(router, 'connected')
		router.connect()
		await expect(opened).resolves.toEqual(['Secondary'])
		expect(router.controller).toBe('Secondary')
		expect(statuses.at(-1)).toEqual([InstanceStatus.Ok, 'Connected to Secondary'])
		await vi.waitFor(() => expect(secondary.texts()).toEqual(['.ZC1,1', '.ZZ1,0', '.ZA1,1']))
	})

	it('connects to the secondary when the primary does not answer at all', async () => {
		const secondary = await secondaryRouter()
		const { router } = createRouter({
			primary: { host: BLACKHOLE, port: 1 },
			secondary: { host: '127.0.0.1', port: secondary.port },
		})
		const opened = once(router, 'connected')
		router.connect()
		await expect(opened).resolves.toEqual(['Secondary'])
	})

	it('goes back to the primary when the secondary fails', async () => {
		const secondary = await secondaryRouter()
		const { router } = createRouter({
			primary: { host: '127.0.0.1', port: secondary.port },
			secondary: { host: '127.0.0.1', port: fake.port },
		})
		router.connect()
		await vi.waitFor(() => expect(secondary.connections).toBe(1))
		secondary.dropConnections()
		await vi.waitFor(() => expect(fake.connections).toBe(1))
		await vi.waitFor(() => expect(router.controller).toBe('Secondary'))
		fake.dropConnections()
		await vi.waitFor(() => expect(secondary.connections).toBe(2))
		expect(router.controller).toBe('Primary')
	})

	it('waits between attempts when neither controller answers', async () => {
		const port = await closedPort()
		const { router, log } = createRouter({
			primary: { host: '127.0.0.1', port },
			secondary: { host: '127.0.0.1', port },
			timing: { reconnectInterval: 100 },
		})
		router.connect()
		await sleep(450)
		// The 1.x module switched controllers on every error, at once: hundreds of attempts a second when both refuse
		const attempts = logged(log, 'debug', /^Connecting to (Primary|Secondary)/).length
		expect(attempts).toBeGreaterThanOrEqual(3)
		expect(attempts).toBeLessThanOrEqual(6)
	})
})

describe('keepalive', () => {
	it('is sent every interval, and not once more for each reconnection', async () => {
		await connected({ timing: { keepaliveInterval: 100 } })
		fake.dropConnections()
		await vi.waitFor(() => expect(fake.connections).toBe(2))
		fake.dropConnections()
		await vi.waitFor(() => expect(fake.connections).toBe(3))
		await vi.waitFor(() => expect(fake.texts(3)).toHaveLength(3))
		const start = fake.received.length
		await sleep(450)
		const keepalives = fake.texts(3).filter((text, i) => text === '.ZZ1,0' && i >= 3).length
		expect(fake.received.length).toBeGreaterThan(start)
		expect(keepalives).toBeGreaterThanOrEqual(3)
		expect(keepalives).toBeLessThanOrEqual(5)
	})

	it('reconnects when a router that answered it stops answering', async () => {
		const { log } = await connected({ timing: { keepaliveInterval: 100, keepaliveTimeout: 100 } })
		await vi.waitFor(() => expect(fake.texts()).toContain('.ZZ1,0'))
		fake.answering = false
		await vi.waitFor(() => expect(fake.connections).toBe(2), { timeout: 1000 })
		expect(logged(log, 'error', /No reply to keepalive within 100 ms/)).toHaveLength(1)
	})

	it('does not watch a router that never answers it', async () => {
		fake.answersKeepalive = false
		await connected({ timing: { keepaliveInterval: 100, keepaliveTimeout: 50, ackTimeout: 20 } })
		await sleep(500)
		expect(fake.connections).toBe(1)
		expect(fake.texts().filter((text) => text === '.ZZ1,0').length).toBeGreaterThanOrEqual(3)
	})
})

describe('sending', () => {
	it('waits for a reply before sending the next message', async () => {
		const { router } = await connected()
		fake.replyDelay = 60
		await Promise.all([1, 2, 3].map(async (d) => router.send(interrogateCrosspoint(d))))
		await vi.waitFor(() => expect(fake.replies).toHaveLength(3))
		const sent = fake.received.map((m) => m.at)
		expect(sent[1]).toBeGreaterThanOrEqual(fake.replies[0] - 1)
		expect(sent[2]).toBeGreaterThanOrEqual(fake.replies[1] - 1)
	})

	it('leaves the gap between messages even when the router replies at once', async () => {
		const { router } = await connected({ timing: { messageGap: 40 } })
		await Promise.all([1, 2, 3].map(async (d) => router.send(interrogateCrosspoint(d))))
		await vi.waitFor(() => expect(fake.received).toHaveLength(3))
		const sent = fake.received.map((m) => m.at)
		expect(sent[1] - sent[0]).toBeGreaterThanOrEqual(38)
		expect(sent[2] - sent[1]).toBeGreaterThanOrEqual(38)
	})

	// The 1.x module waited for a reply with no time limit, so one unanswered message stopped everything after it
	it('sends on after the ack timeout when the router does not reply', async () => {
		const { router, log } = await connected()
		fake.answering = false
		const started = performance.now()
		await Promise.all([1, 2, 3].map(async (d) => router.send(interrogateCrosspoint(d))))
		await vi.waitFor(() => expect(fake.interrogated()).toEqual([1, 2, 3]))
		expect(performance.now() - started).toBeGreaterThanOrEqual(2 * TIMING.ackTimeout - 5)
		expect(logged(log, 'debug', /No reply within 200 ms/).length).toBeGreaterThanOrEqual(2)
	})

	// All but the one already waiting for the line: p-queue starts the next job as soon as the last is written, and the
	// job waits for its turn on the line itself
	it('sends actions ahead of messages queued in the background', async () => {
		const { router } = await connected()
		fake.replyDelay = 50
		const background = [1, 2, 3, 4, 5].map(async (d) => router.send(interrogateCrosspoint(d)))
		await sleep(20)
		expect(fake.received).toHaveLength(1)
		await router.send(setCrosspoint(9, 9), Priority.Action)
		await Promise.all(background)
		await vi.waitFor(() => expect(fake.received).toHaveLength(6))
		expect(fake.texts().indexOf('.SC9,9*XPOINT')).toBe(2)
	})

	it('merges an interrogate of a destination already waiting, moving it up to the higher priority', async () => {
		const { router, log } = await connected()
		fake.replyDelay = 20
		const sends = [1, 2, 3, 4].map(async (d) => router.send(interrogateCrosspoint(d)))
		sends.push(router.send(interrogateCrosspoint(4), Priority.Action))
		await Promise.all(sends)
		await vi.waitFor(() => expect(fake.interrogated()).toEqual([1, 4, 2, 3]))
		expect(logged(log, 'debug', /Merged .IC4,-\*XPOINT/)).toHaveLength(1)
	})

	it('merges settings of one destination, sending the last in the place of the first', async () => {
		const { router } = await connected()
		fake.replyDelay = 20
		await Promise.all([
			router.send(interrogateCrosspoint(1)),
			router.send(setCrosspoint(2, 1)),
			router.send(setGain(2, 3)),
			router.send(setCrosspoint(2, 5)),
			router.send(setCrosspoint(2, 7)),
		])
		await vi.waitFor(() => expect(fake.texts()).toEqual(['.IC1,-*XPOINT', '.SC2,7*XPOINT', '.GC2,3*GAIN']))
		expect(fake.crosspoints.get(2)).toBe(7)
	})

	it('drops a message whose signal aborts before its turn', async () => {
		const { router } = await connected()
		fake.replyDelay = 30
		const first = router.send(interrogateCrosspoint(1))
		const controller = new AbortController()
		const second = router.send(setCrosspoint(2, 2), Priority.Background, controller.signal)
		controller.abort()
		await expect(second).rejects.toThrow()
		await first
		await sleep(100)
		expect(fake.texts()).toEqual(['.IC1,-*XPOINT'])
	})

	it('still sends a merged message while any send merged into it has not aborted', async () => {
		const { router } = await connected()
		fake.replyDelay = 30
		const first = router.send(interrogateCrosspoint(1))
		const controller = new AbortController()
		const aborted = router.send(setCrosspoint(2, 2), Priority.Background, controller.signal)
		const kept = router.send(setCrosspoint(2, 3))
		controller.abort()
		await expect(aborted).rejects.toThrow()
		await Promise.all([first, kept])
		await vi.waitFor(() => expect(fake.routed()).toEqual([{ destination: 2, source: 3 }]))
	})

	it('rejects what is queued when the connection closes, and sends none of it on the next', async () => {
		const { router } = await connected()
		fake.answering = false
		const sends = [1, 2, 3].map(async (d) => router.send(interrogateCrosspoint(d)))
		await vi.waitFor(() => expect(fake.received).toHaveLength(1))
		fake.dropConnections()
		const results = await Promise.allSettled(sends)
		expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'rejected'])
		fake.answering = true
		await vi.waitFor(() => expect(fake.texts(2)).toHaveLength(3))
		await sleep(100)
		expect(fake.texts(2)).toEqual(['.ZC1,1', '.ZZ1,0', '.ZA1,1'])
	})

	it('refuses to send without a connection', async () => {
		const { router } = createRouter()
		await expect(router.send(aliveNotificationRequest())).rejects.toThrow('Not connected')
	})
})

describe('receiving', () => {
	it('reports crosspoints, from replies and notifications', async () => {
		const { router, crosspoints } = await connected()
		await router.send(setCrosspoint(4, 2))
		await vi.waitFor(() => expect(crosspoints).toHaveLength(2))
		expect(crosspoints.map(({ control, destination, source }) => [control, destination, source])).toEqual([
			['A', 4, 2],
			['N', 4, 2],
		])
	})

	it('reports alarms', async () => {
		const { router } = await connected()
		const alarm = once(router, 'alarm')
		fake.broadcast('.NA3,1,PSU 2 failed')
		await expect(alarm).resolves.toEqual([{ type: 'alarm', index: 3, asserted: true, text: 'PSU 2 failed' }])
	})

	// The 1.x module looped forever on a line with no SOM, and an unhandled rejection from a lone SOM ended the process
	it('carries on past lines that are not messages', async () => {
		const { crosspoints, log } = await connected()
		fake.broadcastRaw('\r\rWelcome\r.\r.A\r')
		await sleep(20)
		// More than a line can be, with no EOM
		fake.broadcastRaw('x'.repeat(2000))
		await sleep(20)
		fake.broadcastRaw('\r.NC5,6\r')
		await vi.waitFor(() => expect(crosspoints).toEqual([expect.objectContaining({ destination: 5, source: 6 })]))
		expect(logged(log, 'warn', /Unexpected response from unit: \.$/)).toHaveLength(1)
		expect(logged(log, 'warn', /Unexpected response from unit: \.A$/)).toHaveLength(1)
		expect(logged(log, 'debug', /Ignored text outside a message: Welcome/)).toHaveLength(1)
		expect(logged(log, 'warn', /Discarded \d+ bytes/).length).toBeGreaterThanOrEqual(1)
	})

	it('reads a message split across chunks', async () => {
		const { crosspoints } = await connected()
		fake.broadcastRaw('.NC1')
		await sleep(20)
		fake.broadcastRaw('2,3\r')
		await vi.waitFor(() => expect(crosspoints).toEqual([expect.objectContaining({ destination: 12, source: 3 })]))
	})

	it('survives a crosspoint listener that throws', async () => {
		const { router, log, crosspoints } = await connected()
		router.prependListener('crosspoint', () => {
			throw new Error('listener failed')
		})
		fake.broadcast('.NC1,1')
		await vi.waitFor(() => expect(logged(log, 'error', /listener failed/)).toHaveLength(1))
		router.removeAllListeners('crosspoint')
		router.on('crosspoint', (response) => crosspoints.push(response))
		fake.broadcast('.NC2,2')
		await vi.waitFor(() => expect(crosspoints).toHaveLength(1))
	})
})

describe('waitForCrosspoint', () => {
	it('resolves with the source the router reports for the destination', async () => {
		const { router } = await connected()
		const waiting = router.waitForCrosspoint(7, 1000)
		fake.broadcast('.NC6,1')
		fake.broadcast('.AC7,4*XPOINT')
		await expect(waiting).resolves.toBe(4)
	})

	it('resolves undefined if nothing is reported in time', async () => {
		const { router } = await connected()
		await expect(router.waitForCrosspoint(7, 50)).resolves.toBeUndefined()
	})

	it('rejects when its signal aborts', async () => {
		const { router } = await connected()
		const controller = new AbortController()
		const waiting = router.waitForCrosspoint(7, 1000, controller.signal)
		controller.abort()
		await expect(waiting).rejects.toThrow()
	})
})

describe('destroy', () => {
	it('ends the session and closes the connection for good', async () => {
		const { router } = await connected()
		router.destroy()
		await vi.waitFor(() => expect(fake.openConnections).toBe(0))
		expect(fake.texts()).toEqual(['exit'])
		await expect(router.send(aliveNotificationRequest())).rejects.toThrow('Not connected')
		expect(() => router.connect()).toThrow('destroyed')
		await sleep(TIMING.reconnectInterval * 3)
		expect(fake.connections).toBe(1)
	})

	it('stops a connection attempt in progress', async () => {
		const { router } = createRouter({ primary: { host: BLACKHOLE, port: 1 } })
		router.connect()
		router.destroy()
		await sleep(TIMING.connectTimeout + 100)
		expect(fake.connections).toBe(0)
	})
})
