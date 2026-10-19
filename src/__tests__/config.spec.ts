import { describe, expect, it } from 'vitest'
import { clampCount, DEFAULT_PORT, GetConfigFields, validPort, type ModuleConfig } from '../config.js'

describe('config fields', () => {
	it('keep the ids saved in existing configs', () => {
		const ids = GetConfigFields()
			.filter((field) => field.type !== 'static-text')
			.map((field) => field.id)
		const keys: (keyof ModuleConfig)[] = [
			'hostPri',
			'portPri',
			'hostSec',
			'portSec',
			'redundant',
			'src',
			'dst',
			'alarms',
		]
		expect(ids).toEqual(keys)
	})

	it('default the ports to 10005', () => {
		expect(DEFAULT_PORT).toBe(10005)
		for (const id of ['portPri', 'portSec']) {
			expect(GetConfigFields().find((field) => field.id === id)).toMatchObject({
				type: 'number',
				default: DEFAULT_PORT,
				min: 1,
				max: 65535,
			})
		}
	})

	it('show the secondary only for redundant controllers, and placeholders otherwise', () => {
		const visibility = Object.fromEntries(GetConfigFields().map((field) => [field.id, field.isVisibleExpression]))
		expect(visibility).toMatchObject({
			hostSec: '$(options:redundant)',
			portSec: '$(options:redundant)',
			'place-holder-1': '!$(options:redundant)',
			'place-holder-2': '!$(options:redundant)',
		})
	})
})

describe('clampCount', () => {
	it.each([
		[64, 64],
		[9999, 9999],
		[20000, 9999],
		[0, 1],
		[-3, 1],
		[3.7, 3],
		['64', 64],
		[Number.NaN, 1],
		[undefined, 1],
		['many', 1],
	])('%j becomes %i', (count, expected) => {
		expect(clampCount(count)).toBe(expected)
	})

	it('allows 0 where the minimum is 0, as for alarms', () => {
		expect(clampCount(0, 0)).toBe(0)
		expect(clampCount(undefined, 0)).toBe(0)
	})
})

describe('validPort', () => {
	it('accepts a whole number from 1 to 65535, as a number or text', () => {
		expect(validPort(10005)).toBe(10005)
		expect(validPort('8910')).toBe(8910)
		expect(validPort(65535)).toBe(65535)
	})

	it.each([0, 65536, 20.5, '', 'abc', undefined, null])('rejects %j', (port) => {
		expect(validPort(port)).toBeUndefined()
	})
})
