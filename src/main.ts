import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { clampCount, GetConfigFields, validPort, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { ActionId, UpdateActions, type ActionSchema } from './actions.js'
import { FeedbackId, UpdateFeedbacks, type FeedbackSchema } from './feedbacks.js'
import {
	destinationVariableId,
	UpdateVariableDefinitions,
	UpdateVariableValues,
	type VariablesSchema,
} from './variables.js'
import {
	Control,
	interrogateCrosspoint,
	NO_SOURCE,
	Priority,
	RouterConnection,
	type AlarmResponse,
	type CrosspointResponse,
	type Endpoint,
	type Message,
} from './api/index.js'
import { CrosspointMethod, isInRange } from './options.js'
import { FeedbackSubscriptions } from './subscriptions.js'
import { errorMessage } from './util.js'

/** How long a learn waits for the router to answer an interrogate. Companion gives a learn 5 s in all */
export const LEARN_WAIT_MS = 3000

export type ModuleTypes = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionSchema
	feedbacks: FeedbackSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class NtpDotInstance extends InstanceBase<ModuleTypes> {
	config!: ModuleConfig // Setup in init()
	/** The source on each destination, as the router last reported it. A destination it hasn't reported is absent */
	readonly crosspoints = new Map<number, number>()
	/** The alarms the router has reported as asserted */
	readonly alarms = new Set<number>()
	/** The crosspoint feedbacks in use, by destination */
	readonly crosspointFeedbacks = new FeedbackSubscriptions()
	/** The alarm feedbacks in use, by alarm */
	readonly alarmFeedbacks = new FeedbackSubscriptions()
	isRecordingActions = false
	/** Destinations interrogated on the current connection, so each is asked for once however many feedbacks use it */
	readonly #interrogated = new Set<number>()
	#router: RouterConnection | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	get sourceCount(): number {
		return clampCount(this.config.src)
	}

	get destinationCount(): number {
		return clampCount(this.config.dst)
	}

	get alarmCount(): number {
		return clampCount(this.config.alarms, 0)
	}

	async init(config: ModuleConfig): Promise<void> {
		await this.configUpdated(config)
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.id}`)
		this.#closeRouter()
		this.updateStatus(InstanceStatus.Disconnected)
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#closeRouter()
		// The counts, or the router itself, may have changed
		this.crosspoints.clear()
		this.alarms.clear()
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		UpdateVariableValues(this)
		this.checkFeedbacks(FeedbackId.Crosspoint, FeedbackId.Alarm)
		this.#openRouter()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	handleStartStopRecordActions(isRecording: boolean): void {
		this.isRecordingActions = isRecording
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	/**
	 * Queues a message for the router, ahead of any interrogation in progress
	 * @param signal an action's context.signal, so a message the user no longer wants is dropped before it is sent
	 */
	async send(message: Message, signal?: AbortSignal): Promise<void> {
		if (this.#router === undefined) throw new Error('Not connected to router')
		await this.#router.send(message, Priority.Action, signal)
	}

	async interrogate(destination: number, signal?: AbortSignal): Promise<void> {
		this.#interrogated.add(destination)
		await this.send(interrogateCrosspoint(destination), signal)
	}

	/**
	 * Interrogates a destination in the background, unless it has been already on this connection. For feedbacks and
	 * actions to call as often as they like.
	 */
	requestCrosspoint(destination: number): void {
		const router = this.#router
		if (this.#interrogated.has(destination) || !router?.isConnected) return
		this.#interrogated.add(destination)
		router.send(interrogateCrosspoint(destination), Priority.Background).catch((err) => {
			this.#interrogated.delete(destination)
			this.log('debug', `Interrogate destination ${destination} not sent: ${errorMessage(err)}`)
		})
	}

	/**
	 * The source on a destination, for a learn. Asks the router if it has not reported one yet
	 * @returns undefined for a destination or source outside the configured counts, or if the router doesn't say
	 */
	async learnSource(destination: number, signal: AbortSignal): Promise<number | undefined> {
		if (!isInRange(destination, 1, this.destinationCount)) return undefined
		let source = this.crosspoints.get(destination)
		const router = this.#router
		if (source === undefined && router?.isConnected) {
			;[source] = await Promise.all([
				router.waitForCrosspoint(destination, LEARN_WAIT_MS, signal),
				this.interrogate(destination, signal),
			])
		}
		if (source === undefined) return undefined
		if (!isInRange(source, NO_SOURCE, this.sourceCount)) {
			this.log('warn', `Source ${source} on destination ${destination} is beyond the source count, not learnt`)
			return undefined
		}
		return source
	}

	#openRouter(): void {
		const primary = this.#endpoint(this.config.hostPri, this.config.portPri, 'Primary')
		if (primary === undefined) return
		let secondary: Endpoint | undefined
		if (this.config.redundant) {
			secondary = this.#endpoint(this.config.hostSec, this.config.portSec, 'Secondary')
			if (secondary === undefined) return
		}
		const router = new RouterConnection({
			primary,
			secondary,
			log: (level, message) => this.log(level, message),
		})
		router.on('status', (status, message) => this.updateStatus(status, message))
		router.on('connected', () => this.#onConnected())
		router.on('crosspoint', (response) => this.#onCrosspoint(response))
		router.on('alarm', (response) => this.#onAlarm(response))
		this.#router = router
		router.connect()
	}

	/** A host and port from the config, or undefined, with the status set to say why, if either is unusable */
	#endpoint(host: string | undefined, port: unknown, name: string): Endpoint | undefined {
		const trimmed = host?.trim()
		if (!trimmed) {
			this.log('error', `${name} host not defined`)
			this.updateStatus(InstanceStatus.BadConfig, `${name} not defined`)
			return undefined
		}
		const valid = validPort(port)
		if (valid === undefined) {
			this.log('error', `${name} port ${String(port)} is not valid`)
			this.updateStatus(InstanceStatus.BadConfig, `${name} port invalid`)
			return undefined
		}
		return { host: trimmed, port: valid }
	}

	#closeRouter(): void {
		this.#router?.destroy()
		this.#router = undefined
		this.#interrogated.clear()
	}

	#onConnected(): void {
		// Crosspoints may have changed while disconnected, so each in use is asked for again: the feedback callbacks and
		// action subscribe hooks each ask for theirs
		this.#interrogated.clear()
		this.subscribeActions()
		this.checkAllFeedbacks()
	}

	#onCrosspoint({ control, destination, source }: CrosspointResponse): void {
		if (!isInRange(destination, 1, this.destinationCount)) {
			this.log('debug', `Destination ${destination} is beyond the destination count, ignored`)
			return
		}
		// Reported already, so there is no need to interrogate it
		this.#interrogated.add(destination)
		const previous = this.crosspoints.get(destination)
		this.crosspoints.set(destination, source)
		if (previous !== source) {
			this.setVariableValues({ [destinationVariableId(destination)]: source })
			this.#checkFeedbacksFor(this.crosspointFeedbacks, destination)
		}
		// A notification is a change made by anyone, this module included. Replies to its own requests aren't recorded
		if (control === Control.NotifySet && this.isRecordingActions && isInRange(source, NO_SOURCE, this.sourceCount)) {
			this.recordAction(
				{
					actionId: ActionId.Crosspoint,
					options: { dst: destination, src: source, method: CrosspointMethod.Set },
				},
				`connect ${destination}`,
			)
		}
	}

	#onAlarm({ index, asserted, text }: AlarmResponse): void {
		if (asserted) {
			this.log('warn', `An Alarm has been asserted: ${text}`)
			this.alarms.add(index)
		} else {
			this.log('info', `An Alarm has been removed: ${text}`)
			this.alarms.delete(index)
		}
		this.#checkFeedbacksFor(this.alarmFeedbacks, index)
	}

	/** Rechecks the feedbacks reading a destination or alarm, if any are */
	#checkFeedbacksFor(subscriptions: FeedbackSubscriptions, key: number): void {
		const ids = subscriptions.feedbacksFor(key)
		if (ids.length > 0) this.checkFeedbacksById(...ids)
	}
}
