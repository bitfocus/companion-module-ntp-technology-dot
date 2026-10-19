import type { CompanionActionDefinitions } from '@companion-module/base'
import type NtpDotInstance from './main.js'
import {
	isDelay,
	isGain,
	isP48,
	MAX_DELAY_MS,
	NO_SOURCE,
	removeCrosspoint,
	setCrosspoint,
	setDelay,
	setGain,
	setP48,
	type P48,
} from './api/index.js'
import {
	CrosspointMethod,
	crosspointSourceOption,
	delayOption,
	destinationOption,
	gainOption,
	inputOption,
	isInRange,
	methodOption,
	p48Option,
} from './options.js'
import { unhandledOption } from './util.js'

/** Action ids. The values are the ids saved against every button using the action, so they must never change */
export enum ActionId {
	Crosspoint = 'crosspoint',
	SourceGain = 'source_gain',
	SourceP48 = 'source_p48',
	SourceDelay = 'source_delay',
}

export type ActionSchema = {
	[ActionId.Crosspoint]: { options: { dst: number; src: number; method: CrosspointMethod } }
	[ActionId.SourceGain]: { options: { src: number; gain: number } }
	[ActionId.SourceP48]: { options: { src: number; p48: P48 } }
	[ActionId.SourceDelay]: { options: { src: number; delay: number } }
}

function checkDestination(self: NtpDotInstance, dst: number, action: string): void {
	if (!isInRange(dst, 1, self.destinationCount)) {
		throw new Error(`Destination ${dst} is not 1 to ${self.destinationCount}, ${action} not sent`)
	}
}

/** @param min 0 where no source is allowed, otherwise 1 */
function checkSource(self: NtpDotInstance, src: number, action: string, min: number): void {
	if (!isInRange(src, min, self.sourceCount)) {
		throw new Error(`Source ${src} is not ${min} to ${self.sourceCount}, ${action} not sent`)
	}
}

export function UpdateActions(self: NtpDotInstance): void {
	const dstOption = destinationOption(self.destinationCount)
	const srcOption = inputOption(self.sourceCount)

	const actions: CompanionActionDefinitions<ActionSchema> = {
		[ActionId.Crosspoint]: {
			name: 'Crosspoint',
			description: 'Set, remove or interrogate a crosspoint',
			options: [dstOption, crosspointSourceOption(self.sourceCount), methodOption],
			callback: async ({ options }, context) => {
				checkDestination(self, options.dst, 'Crosspoint')
				switch (options.method) {
					case CrosspointMethod.Set:
						checkSource(self, options.src, 'Crosspoint', NO_SOURCE)
						await self.send(setCrosspoint(options.dst, options.src), context.signal)
						break
					case CrosspointMethod.Remove:
						await self.send(removeCrosspoint(options.dst), context.signal)
						break
					case CrosspointMethod.Interrogate:
						await self.interrogate(options.dst, context.signal)
						break
					default:
						// The 1.x module interrogated for anything but set and remove
						unhandledOption(options.method, undefined)
						await self.interrogate(options.dst, context.signal)
				}
			},
			// So that learn has the crosspoint to hand
			optionsToMonitorForSubscribe: ['dst'],
			subscribe: ({ options }) => {
				if (isInRange(options.dst, 1, self.destinationCount)) self.requestCrosspoint(options.dst)
			},
			learn: async ({ options }, context) => {
				const src = await self.learnSource(options.dst, context.signal)
				return src === undefined ? undefined : { src }
			},
		},
		[ActionId.SourceGain]: {
			name: 'Input - Gain',
			description: 'Microphone Gain',
			options: [srcOption, gainOption],
			callback: async ({ options }, context) => {
				checkSource(self, options.src, 'Gain', 1)
				if (!isGain(options.gain)) throw new Error(`Gain ${options.gain} is not a gain step, Gain not sent`)
				await self.send(setGain(options.src, options.gain), context.signal)
			},
		},
		[ActionId.SourceP48]: {
			name: 'Input - P48',
			description: 'Microphone Phantom Power',
			options: [srcOption, p48Option],
			callback: async ({ options }, context) => {
				checkSource(self, options.src, 'P48', 1)
				if (!isP48(options.p48)) throw new Error(`Phantom power ${String(options.p48)} is not 0 or 1, P48 not sent`)
				await self.send(setP48(options.src, options.p48), context.signal)
			},
		},
		[ActionId.SourceDelay]: {
			name: 'Input - Delay',
			description: 'Input Delay',
			options: [srcOption, delayOption],
			callback: async ({ options }, context) => {
				checkSource(self, options.src, 'Delay', 1)
				if (!isDelay(options.delay) || options.delay > MAX_DELAY_MS) {
					throw new Error(`Delay ${options.delay} is not 0 to ${MAX_DELAY_MS} ms, Delay not sent`)
				}
				await self.send(setDelay(options.src, options.delay), context.signal)
			},
		},
	}

	self.setActionDefinitions(actions)
}
