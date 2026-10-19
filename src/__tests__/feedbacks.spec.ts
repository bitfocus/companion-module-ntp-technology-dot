import { describe, expect, it } from 'vitest'
import { FeedbackId } from '../feedbacks.js'
import { checkFeedback, fakeInstance, feedbackDefinitions, learnFeedback, unsubscribeFeedback } from './fixtures.js'

describe('Crosspoint feedback', () => {
	it('is true only for the source on the destination', () => {
		const fake = fakeInstance()
		fake.self.crosspoints.set(3, 5)
		const defs = feedbackDefinitions(fake)
		expect(checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 5 })).toBe(true)
		expect(checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 4 })).toBe(false)
		expect(checkFeedback(defs, FeedbackId.Crosspoint, { dst: 2, src: 5 })).toBe(false)
	})

	it('is true for no source once the router has reported none', () => {
		const fake = fakeInstance()
		fake.self.crosspoints.set(3, 0)
		expect(checkFeedback(feedbackDefinitions(fake), FeedbackId.Crosspoint, { dst: 3, src: 0 })).toBe(true)
	})

	// The 1.x module started every destination at source 0, so no source showed true before the router said anything
	it('is false for no source on a destination the router has not reported', () => {
		const fake = fakeInstance()
		expect(checkFeedback(feedbackDefinitions(fake), FeedbackId.Crosspoint, { dst: 3, src: 0 })).toBe(false)
	})

	it('asks for its destination, and only one in range', () => {
		const fake = fakeInstance()
		const defs = feedbackDefinitions(fake)
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 1 })
		expect(checkFeedback(defs, FeedbackId.Crosspoint, { dst: 9, src: 1 })).toBe(false)
		expect(fake.requestCrosspoint).toHaveBeenCalledExactlyOnceWith(3)
	})

	it('watches its destination, and moves to another when its destination is changed', () => {
		const fake = fakeInstance()
		const defs = feedbackDefinitions(fake)
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 1 }, 'fb-1')
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 2 }, 'fb-2')
		expect(fake.self.crosspointFeedbacks.feedbacksFor(3)).toEqual(['fb-1', 'fb-2'])
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 5, src: 1 }, 'fb-1')
		expect(fake.self.crosspointFeedbacks.feedbacksFor(3)).toEqual(['fb-2'])
		expect(fake.self.crosspointFeedbacks.feedbacksFor(5)).toEqual(['fb-1'])
		expect(fake.self.alarmFeedbacks.feedbacksFor(5)).toEqual([])
	})

	it('stops watching its destination once changed to one out of range', () => {
		const fake = fakeInstance()
		const defs = feedbackDefinitions(fake)
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 1 }, 'fb-1')
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 9, src: 1 }, 'fb-1')
		expect(fake.self.crosspointFeedbacks.feedbacksFor(3)).toEqual([])
	})

	it('stops watching its destination once removed', async () => {
		const fake = fakeInstance()
		const defs = feedbackDefinitions(fake)
		checkFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 1 }, 'fb-1')
		await unsubscribeFeedback(defs, FeedbackId.Crosspoint, { dst: 3, src: 1 }, 'fb-1')
		expect(fake.self.crosspointFeedbacks.feedbacksFor(3)).toEqual([])
	})

	it('learns only the source', async () => {
		const fake = fakeInstance()
		fake.learnSource.mockResolvedValue(2)
		const signal = new AbortController().signal
		await expect(
			learnFeedback(feedbackDefinitions(fake), FeedbackId.Crosspoint, { dst: 6, src: 1 }, signal),
		).resolves.toEqual({ src: 2 })
		expect(fake.learnSource).toHaveBeenCalledExactlyOnceWith(6, signal)
	})
})

describe('Alarm feedback', () => {
	it('is true while the alarm is asserted', () => {
		const fake = fakeInstance()
		fake.self.alarms.add(4)
		const defs = feedbackDefinitions(fake)
		expect(checkFeedback(defs, FeedbackId.Alarm, { alarm: 4 })).toBe(true)
		expect(checkFeedback(defs, FeedbackId.Alarm, { alarm: 5 })).toBe(false)
	})

	it('watches its alarm, and moves to another when its alarm is changed', () => {
		const fake = fakeInstance()
		const defs = feedbackDefinitions(fake)
		checkFeedback(defs, FeedbackId.Alarm, { alarm: 4 }, 'fb-1')
		checkFeedback(defs, FeedbackId.Alarm, { alarm: 4 }, 'fb-2')
		expect(fake.self.alarmFeedbacks.feedbacksFor(4)).toEqual(['fb-1', 'fb-2'])
		checkFeedback(defs, FeedbackId.Alarm, { alarm: 6 }, 'fb-1')
		expect(fake.self.alarmFeedbacks.feedbacksFor(4)).toEqual(['fb-2'])
		expect(fake.self.alarmFeedbacks.feedbacksFor(6)).toEqual(['fb-1'])
		expect(fake.self.crosspointFeedbacks.feedbacksFor(6)).toEqual([])
	})

	it('stops watching its alarm once removed', async () => {
		const fake = fakeInstance()
		const defs = feedbackDefinitions(fake)
		checkFeedback(defs, FeedbackId.Alarm, { alarm: 4 }, 'fb-1')
		await unsubscribeFeedback(defs, FeedbackId.Alarm, { alarm: 4 }, 'fb-1')
		expect(fake.self.alarmFeedbacks.feedbacksFor(4)).toEqual([])
	})

	it('offers the alarms up to the configured count', () => {
		const defs = feedbackDefinitions(fakeInstance({ alarms: 12 }))
		expect(defs[FeedbackId.Alarm]).toMatchObject({ options: [{ id: 'alarm', min: 1, max: 12 }] })
	})

	it('keeps a usable range with no alarms configured', () => {
		const defs = feedbackDefinitions(fakeInstance({ alarms: 0 }))
		expect(defs[FeedbackId.Alarm]).toMatchObject({ options: [{ id: 'alarm', min: 1, max: 1 }] })
	})
})
