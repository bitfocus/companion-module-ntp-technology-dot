import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type NtpDotInstance from './main.js'
import { alarmOption, crosspointSourceOption, destinationOption, isInRange } from './options.js'

/** Feedback ids. The values are the ids saved against every button using the feedback, so they must never change */
export enum FeedbackId {
	Crosspoint = 'checkCrosspoint',
	Alarm = 'alarm',
}

export type FeedbackSchema = {
	[FeedbackId.Crosspoint]: { type: 'boolean'; options: { dst: number; src: number } }
	[FeedbackId.Alarm]: { type: 'boolean'; options: { alarm: number } }
}

const defaultStyle = {
	bgcolor: combineRgb(255, 0, 0),
	color: combineRgb(0, 0, 0),
}

export function UpdateFeedbacks(self: NtpDotInstance): void {
	const feedbacks: CompanionFeedbackDefinitions<FeedbackSchema> = {
		[FeedbackId.Crosspoint]: {
			name: 'Crosspoint',
			description: 'True when the source is routed to the destination',
			type: 'boolean',
			defaultStyle,
			options: [destinationOption(self.destinationCount), crosspointSourceOption(self.sourceCount)],
			callback: ({ id, options }) => {
				// Before the range check, so a feedback whose destination is changed to one out of range stops watching the
				// one it had
				self.crosspointFeedbacks.subscribe(id, options.dst)
				if (!isInRange(options.dst, 1, self.destinationCount)) return false
				// API 2.x has no feedback subscribe hook. A feedback being checked is one in use, so it asks for its
				// destination here. That happens once a connection, however often the callback runs
				self.requestCrosspoint(options.dst)
				return self.crosspoints.get(options.dst) === options.src
			},
			unsubscribe: ({ id }) => self.crosspointFeedbacks.unsubscribe(id),
			learn: async ({ options }, context) => {
				const src = await self.learnSource(options.dst, context.signal)
				return src === undefined ? undefined : { src }
			},
		},
		[FeedbackId.Alarm]: {
			name: 'Alarm',
			description: 'True while the alarm is asserted. Its text is written to the log',
			type: 'boolean',
			defaultStyle,
			options: [alarmOption(self.alarmCount)],
			callback: ({ id, options }) => {
				self.alarmFeedbacks.subscribe(id, options.alarm)
				return self.alarms.has(options.alarm)
			},
			unsubscribe: ({ id }) => self.alarmFeedbacks.unsubscribe(id),
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
