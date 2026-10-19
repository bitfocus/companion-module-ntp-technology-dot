import { setTimeout as sleep } from 'node:timers/promises'
import { InstanceStatus, type CompanionFeedbackDefinitions } from '@companion-module/base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NtpDotInstance from '../main.js'
import type { ModuleConfig } from '../config.js'
import { setCrosspoint } from '../api/index.js'
import { FeedbackId, type FeedbackSchema } from '../feedbacks.js'
import { ActionId } from '../actions.js'
import { CrosspointMethod } from '../options.js'
import { closedPort, FakeRouter } from './fakeRouter.js'
import { checkFeedback } from './fixtures.js'

/** What InstanceBase needs from the host, with everything it forwards to Companion mocked */
function createContext() {
	return {
		id: 'test-instance',
		_isInstanceContext: true as const,
		label: 'test',
		upgradeScripts: [],
		saveConfig: vi.fn(),
		updateStatus: vi.fn(),
		oscSend: vi.fn(),
		recordAction: vi.fn(),
		setActionDefinitions: vi.fn(),
		subscribeActions: vi.fn(),
		unsubscribeActions: vi.fn(),
		setFeedbackDefinitions: vi.fn(),
		unsubscribeFeedbacks: vi.fn(),
		checkFeedbacks: vi.fn(),
		checkAllFeedbacks: vi.fn(),
		checkFeedbacksById: vi.fn(),
		setPresetDefinitions: vi.fn(),
		setCompositeElementDefinitions: vi.fn(),
		setVariableDefinitions: vi.fn(),
		setVariableValues: vi.fn(),
		getVariableValue: vi.fn(),
		sharedUdpSocketHandlers: new Map(),
		sharedUdpSocketJoin: vi.fn(),
		sharedUdpSocketLeave: vi.fn(),
		sharedUdpSocketSend: vi.fn(),
	}
}

let fake: FakeRouter
const instances: NtpDotInstance[] = []

beforeEach(async () => {
	fake = new FakeRouter()
	await fake.listen()
})

afterEach(async () => {
	for (const instance of instances.splice(0)) await instance.destroy()
	await fake.close()
})

function createInstance() {
	const context = createContext()
	const instance = new NtpDotInstance(context)
	const log = vi.spyOn(instance, 'log').mockImplementation(() => {})
	instances.push(instance)
	return { instance, context, log }
}

function config(overrides: Partial<ModuleConfig> = {}): ModuleConfig {
	return {
		hostPri: '127.0.0.1',
		portPri: fake.port,
		hostSec: '',
		portSec: 10005,
		redundant: false,
		src: 16,
		dst: 8,
		alarms: 4,
		...overrides,
	}
}

const allVariableValues = (context: ReturnType<typeof createContext>) =>
	Object.assign({}, ...context.setVariableValues.mock.calls.map(([values]) => values as object)) as Record<
		string,
		unknown
	>

/** The feedback definitions last given to Companion, for their callbacks to be run against the real instance */
const definedFeedbacks = (context: ReturnType<typeof createContext>) =>
	context.setFeedbackDefinitions.mock.calls.at(-1)?.[0] as CompanionFeedbackDefinitions<FeedbackSchema>

/** Waits for the connection, and for the notification requests sent on connecting to be answered */
async function started(overrides: Partial<ModuleConfig> = {}) {
	const created = createInstance()
	await created.instance.init(config(overrides))
	await vi.waitFor(() =>
		expect(created.context.updateStatus).toHaveBeenCalledWith(InstanceStatus.Ok, 'Connected to Primary'),
	)
	await vi.waitFor(() => expect(fake.received).toHaveLength(3))
	await sleep(100)
	return created
}

describe('starting', () => {
	// The 1.x module set these from config.destinations, which does not exist, so never set them at all
	it('defines a variable per destination, each unknown until the router says', async () => {
		const { instance, context } = createInstance()
		await instance.init(config({ hostPri: '' }))
		expect(Object.keys(context.setVariableDefinitions.mock.calls[0][0])).toEqual([
			'dst1',
			'dst2',
			'dst3',
			'dst4',
			'dst5',
			'dst6',
			'dst7',
			'dst8',
		])
		expect(context.setVariableValues).toHaveBeenCalledWith(
			Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((d) => [`dst${d}`, 'unknown'])),
		)
	})

	it('asks for notifications, then for the crosspoints in use, once a connection', async () => {
		const { instance, context } = await started()
		expect(fake.texts()).toEqual(['.ZC1,1', '.ZZ1,0', '.ZA1,1'])
		expect(context.subscribeActions).toHaveBeenCalled()
		expect(context.checkAllFeedbacks).toHaveBeenCalled()
		// As the feedback callbacks and action subscribe hooks do
		instance.requestCrosspoint(3)
		instance.requestCrosspoint(3)
		instance.requestCrosspoint(5)
		await vi.waitFor(() => expect(instance.crosspoints.size).toBe(2))
		instance.requestCrosspoint(3)
		await sleep(100)
		expect(fake.interrogated()).toEqual([3, 5])
	})

	it('asks again for every destination after reconnecting', async () => {
		const { instance } = await started()
		instance.requestCrosspoint(3)
		await vi.waitFor(() => expect(fake.interrogated()).toEqual([3]))
		fake.dropConnections()
		await vi.waitFor(() => expect(fake.texts(2)).toHaveLength(3), { timeout: 4000 })
		instance.requestCrosspoint(3)
		await vi.waitFor(() => expect(fake.interrogated()).toEqual([3, 3]))
	})

	it('drops interrogates still queued when the connection closes, without leaving them pending', async () => {
		const { instance, log } = await started()
		fake.answering = false
		instance.requestCrosspoint(3) // sent, then holds the line waiting for a reply
		instance.requestCrosspoint(4) // queued behind it
		await vi.waitFor(() => expect(fake.interrogated()).toEqual([3]))
		fake.dropConnections()
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith('debug', expect.stringMatching(/Interrogate destination 4 not sent/)),
		)
		expect(fake.interrogated()).toEqual([3])
	})

	it('reports a missing host or an unusable port as bad config, without connecting', async () => {
		const { instance, context } = createInstance()
		await instance.init(config({ hostPri: '  ' }))
		expect(context.updateStatus).toHaveBeenLastCalledWith(InstanceStatus.BadConfig, 'Primary not defined')
		await instance.configUpdated(config({ portPri: 0 }))
		expect(context.updateStatus).toHaveBeenLastCalledWith(InstanceStatus.BadConfig, 'Primary port invalid')
		await sleep(50)
		expect(fake.connections).toBe(0)
		await expect(instance.send(setCrosspoint(1, 1))).rejects.toThrow('Not connected')
	})

	// The 1.x module returned before defining anything, leaving the actions of the previous config in place
	it('reports redundant controllers without a secondary as bad config, still defining everything', async () => {
		const { instance, context } = createInstance()
		await instance.init(config({ redundant: true, hostSec: '' }))
		expect(context.updateStatus).toHaveBeenLastCalledWith(InstanceStatus.BadConfig, 'Secondary not defined')
		expect(context.setActionDefinitions).toHaveBeenCalled()
		expect(context.setFeedbackDefinitions).toHaveBeenCalled()
		expect(context.setVariableDefinitions).toHaveBeenCalled()
		await sleep(50)
		expect(fake.connections).toBe(0)
	})

	it('keeps the counts within what the config allows', async () => {
		const { instance } = createInstance()
		await instance.init(config({ hostPri: '', src: 20000, dst: 0, alarms: -1 }))
		expect(instance.sourceCount).toBe(9999)
		expect(instance.destinationCount).toBe(1)
		expect(instance.alarmCount).toBe(0)
	})
})

describe('redundant controllers', () => {
	it('connect to the secondary when the primary is not there', async () => {
		const { instance, context } = createInstance()
		await instance.init(
			config({ portPri: await closedPort(), redundant: true, hostSec: '127.0.0.1', portSec: fake.port }),
		)
		await vi.waitFor(
			() => expect(context.updateStatus).toHaveBeenCalledWith(InstanceStatus.Ok, 'Connected to Secondary'),
			{ timeout: 4000 },
		)
		instance.requestCrosspoint(2)
		await vi.waitFor(() => expect(instance.crosspoints.get(2)).toBe(0))
	})
})

describe('crosspoint changes', () => {
	it('update the variable, and the feedbacks on that destination, when the router reports one, and only when it changes', async () => {
		const { instance, context } = await started()
		const defs = definedFeedbacks(context)
		context.checkFeedbacks.mockClear()
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 2, src: 5 }, 'on-2')
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 5 }, 'on-3')
		// Each asks for its destination, and the router's answer is the first report of it
		await vi.waitFor(() => expect(instance.crosspoints.size).toBe(2))
		expect(context.checkFeedbacksById.mock.calls).toEqual([[['on-2']], [['on-3']]])
		context.checkFeedbacksById.mockClear()
		context.setVariableValues.mockClear()
		fake.broadcast('.NC2,5')
		fake.broadcast('.NC4,1') // no feedback is on it
		await vi.waitFor(() => expect(instance.crosspoints.get(4)).toBe(1))
		expect(context.setVariableValues.mock.calls).toEqual([[{ dst2: 5 }], [{ dst4: 1 }]])
		expect(context.checkFeedbacksById).toHaveBeenCalledExactlyOnceWith(['on-2'])
		fake.broadcast('.AC2,5*XPOINT')
		await sleep(50)
		expect(context.setVariableValues).toHaveBeenCalledTimes(2)
		expect(context.checkFeedbacksById).toHaveBeenCalledTimes(1)
		expect(context.checkFeedbacks).not.toHaveBeenCalled()
	})

	it('come from the reply to a set', async () => {
		const { instance, context } = await started()
		await instance.send(setCrosspoint(7, 9))
		await vi.waitFor(() => expect(instance.crosspoints.get(7)).toBe(9))
		expect(allVariableValues(context)).toMatchObject({ dst7: 9 })
	})

	it('ignore a destination beyond the configured count', async () => {
		const { instance, context, log } = await started()
		context.setVariableValues.mockClear()
		fake.broadcast('.NC100,1')
		await sleep(50)
		expect(instance.crosspoints.has(100)).toBe(false)
		expect(context.setVariableValues).not.toHaveBeenCalled()
		expect(log).toHaveBeenCalledWith('debug', 'Destination 100 is beyond the destination count, ignored')
	})

	it('are recorded as crosspoint actions while recording, from notifications within the source count', async () => {
		const { instance, context } = await started()
		instance.handleStartStopRecordActions(true)
		fake.broadcast('.AC1,3*XPOINT') // a reply, not a change
		fake.broadcast('.NC2,5')
		fake.broadcast('.NC4,0')
		fake.broadcast('.NC3,100') // beyond the source count
		await vi.waitFor(() => expect(instance.crosspoints.get(3)).toBe(100))
		expect(context.recordAction.mock.calls).toEqual([
			[{ actionId: ActionId.Crosspoint, options: { dst: 2, src: 5, method: CrosspointMethod.Set } }, 'connect 2'],
			[{ actionId: ActionId.Crosspoint, options: { dst: 4, src: 0, method: CrosspointMethod.Set } }, 'connect 4'],
		])
		instance.handleStartStopRecordActions(false)
		fake.broadcast('.NC5,1')
		await vi.waitFor(() => expect(instance.crosspoints.get(5)).toBe(1))
		expect(context.recordAction).toHaveBeenCalledTimes(2)
	})
})

describe('alarms', () => {
	it('are asserted and removed as the router reports them, with their text logged', async () => {
		const { instance, log } = await started()
		fake.broadcast('.NA2,1,PSU 2 failed')
		await vi.waitFor(() => expect(instance.alarms.has(2)).toBe(true))
		expect(log).toHaveBeenCalledWith('warn', 'An Alarm has been asserted: PSU 2 failed')
		fake.broadcast('.fA2,0,PSU 2 failed')
		await vi.waitFor(() => expect(instance.alarms.has(2)).toBe(false))
		expect(log).toHaveBeenCalledWith('info', 'An Alarm has been removed: PSU 2 failed')
	})

	it('recheck only the feedbacks on that alarm', async () => {
		const { instance, context } = await started()
		const defs = definedFeedbacks(context)
		context.checkFeedbacks.mockClear()
		checkFeedback(defs, FeedbackId.Alarm, { alarm: 2 }, 'alarm-2')
		checkFeedback(defs, FeedbackId.Alarm, { alarm: 3 }, 'alarm-3')
		fake.broadcast('.NA2,1,PSU 2 failed')
		fake.broadcast('.NA4,1,Fan failed') // no feedback is on it
		await vi.waitFor(() => expect(instance.alarms.has(4)).toBe(true))
		expect(context.checkFeedbacksById).toHaveBeenCalledExactlyOnceWith(['alarm-2'])
		fake.broadcast('.fA2,0,PSU 2 failed')
		await vi.waitFor(() => expect(instance.alarms.has(2)).toBe(false))
		expect(context.checkFeedbacksById.mock.calls).toEqual([[['alarm-2']], [['alarm-2']]])
		expect(context.checkFeedbacks).not.toHaveBeenCalled()
	})
})

describe('sending', () => {
	it('passes on the abort signal', async () => {
		const { instance } = await started()
		await expect(instance.send(setCrosspoint(1, 2), AbortSignal.abort())).rejects.toThrow()
		await sleep(100)
		expect(fake.routed()).toEqual([])
	})
})

describe('learnSource', () => {
	it('answers from what the router has reported, without asking again', async () => {
		const { instance } = await started()
		fake.broadcast('.NC1,6')
		await vi.waitFor(() => expect(instance.crosspoints.get(1)).toBe(6))
		fake.received.length = 0
		await expect(instance.learnSource(1, new AbortController().signal)).resolves.toBe(6)
		expect(fake.received).toEqual([])
	})

	// The 1.x module started every destination at source 0, so learnt no source for any it had not been told of
	it('interrogates a destination not yet reported, and waits for the answer', async () => {
		fake.crosspoints.set(4, 9)
		const { instance } = await started()
		await expect(instance.learnSource(4, new AbortController().signal)).resolves.toBe(9)
		expect(fake.interrogated()).toEqual([4])
	})

	it('learns nothing for a source beyond the configured count, or a destination outside it', async () => {
		fake.crosspoints.set(4, 100)
		const { instance, log } = await started()
		await expect(instance.learnSource(4, new AbortController().signal)).resolves.toBeUndefined()
		expect(log).toHaveBeenCalledWith('warn', expect.stringMatching(/Source 100 on destination 4 is beyond/))
		await expect(instance.learnSource(9, new AbortController().signal)).resolves.toBeUndefined()
	})

	it('stops when the learn is cancelled', async () => {
		const { instance } = await started()
		fake.answering = false
		const controller = new AbortController()
		const learning = instance.learnSource(4, controller.signal)
		controller.abort()
		await expect(learning).rejects.toThrow()
	})
})

describe('config changes and teardown', () => {
	it('end the session, replace the connection, and rebuild the definitions for the new counts', async () => {
		const { instance, context } = await started()
		fake.broadcast('.NC1,6')
		fake.broadcast('.NA1,1,x')
		await vi.waitFor(() => expect(instance.alarms.size).toBe(1))
		await instance.configUpdated(config({ dst: 4 }))
		await vi.waitFor(() => expect(fake.connections).toBe(2))
		await vi.waitFor(() => expect(fake.openConnections).toBe(1))
		expect(fake.texts(1).at(-1)).toBe('exit')
		expect(instance.crosspoints.size).toBe(0)
		expect(instance.alarms.size).toBe(0)
		expect(Object.keys(context.setVariableDefinitions.mock.calls.at(-1)?.[0] ?? {})).toEqual([
			'dst1',
			'dst2',
			'dst3',
			'dst4',
		])
	})

	it('destroy ends the session and closes the connection for good', async () => {
		const { instance, context } = await started()
		await instance.destroy()
		await vi.waitFor(() => expect(fake.openConnections).toBe(0))
		expect(fake.texts().at(-1)).toBe('exit')
		expect(context.updateStatus).toHaveBeenLastCalledWith(InstanceStatus.Disconnected, null)
		await expect(instance.send(setCrosspoint(1, 1))).rejects.toThrow('Not connected')
	})
})
