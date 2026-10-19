import { describe, expect, it } from 'vitest'
import {
	alarmNotificationRequest,
	aliveNotificationRequest,
	crosspointNotificationRequest,
	interrogateCrosspoint,
	MAX_INDEX,
	P48,
	removeCrosspoint,
	setCrosspoint,
	setDelay,
	setGain,
	setP48,
} from '../api/index.js'

describe('message text', () => {
	// Each as the 1.x module built it, which is what has been used against routers
	it.each([
		['set crosspoint', setCrosspoint(12, 3), '.SC12,3*XPOINT'],
		['remove crosspoint', removeCrosspoint(12), '.SC12,0*XPOINT'],
		['interrogate', interrogateCrosspoint(12), '.IC12,-*XPOINT'],
		['gain', setGain(5, 3), '.GC5,3*GAIN'],
		['P48', setP48(5, P48.On), '.PC5,1*P48'],
		['delay', setDelay(5, 250), '.DC5,250*DELAY'],
		['crosspoint notifications', crosspointNotificationRequest(), '.ZC1,1'],
		['alive notifications', aliveNotificationRequest(), '.ZZ1,0'],
		['alarm notifications', alarmNotificationRequest(), '.ZA1,1'],
	])('%s', (_name, message, text) => {
		expect(message.text).toBe(text)
	})

	it('takes the highest numbers the config allows', () => {
		expect(setCrosspoint(MAX_INDEX, MAX_INDEX).text).toBe('.SC9999,9999*XPOINT')
	})
})

describe('parameter checks', () => {
	it.each([0, -1, 1.5, NaN, MAX_INDEX + 1])('refuses destination %s', (destination) => {
		expect(() => setCrosspoint(destination, 1)).toThrow(RangeError)
		expect(() => interrogateCrosspoint(destination)).toThrow(RangeError)
	})

	it('allows no source on a crosspoint, but not on an input', () => {
		expect(setCrosspoint(1, 0).text).toBe('.SC1,0*XPOINT')
		expect(() => setGain(0, 1)).toThrow(RangeError)
		expect(() => setP48(0, P48.Off)).toThrow(RangeError)
		expect(() => setDelay(0, 0)).toThrow(RangeError)
	})

	it.each([-1, 8, 2.5])('refuses gain %s', (gain) => {
		expect(() => setGain(1, gain)).toThrow(RangeError)
	})

	it('refuses a P48 setting that is not off or on', () => {
		expect(() => setP48(1, 2 as P48)).toThrow(RangeError)
	})

	it.each([-1, 0.5])('refuses delay %s', (delay) => {
		expect(() => setDelay(1, delay)).toThrow(RangeError)
	})

	it('refuses a value of the wrong type', () => {
		expect(() => setGain(1, '3' as unknown as number)).toThrow(RangeError)
	})
})

describe('merge keys', () => {
	it('share one key for each setting of one thing, whatever the value', () => {
		expect(setCrosspoint(4, 1).key).toBe(setCrosspoint(4, 9).key)
		expect(removeCrosspoint(4).key).toBe(setCrosspoint(4, 9).key)
		expect(setGain(4, 1).key).toBe(setGain(4, 6).key)
		expect(setP48(4, P48.On).key).toBe(setP48(4, P48.Off).key)
		expect(setDelay(4, 1).key).toBe(setDelay(4, 900).key)
		expect(interrogateCrosspoint(4).key).toBe(interrogateCrosspoint(4).key)
	})

	it('differ between destinations, sources and kinds of message', () => {
		const keys = [
			setCrosspoint(4, 1),
			setCrosspoint(5, 1),
			interrogateCrosspoint(4),
			setGain(4, 1),
			setGain(5, 1),
			setP48(4, P48.On),
			setDelay(4, 1),
			crosspointNotificationRequest(),
			aliveNotificationRequest(),
			alarmNotificationRequest(),
		].map((message) => message.key)
		expect(new Set(keys).size).toBe(keys.length)
	})
})
