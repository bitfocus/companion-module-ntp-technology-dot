import type { CompanionInputFieldDropdown, CompanionInputFieldNumber, DropdownChoice } from '@companion-module/base'
import { MAX_DELAY_MS, MAX_GAIN, NO_SOURCE, P48 } from './api/index.js'

/**
 * Before API 2.x the destination, source and gain options were dropdowns allowing custom values, which is how variables
 * got in. Expression mode replaces that, and UpgradeScripts[0] converts the custom values saved.
 *
 * In expression mode Companion skips the action or feedback when the result is not one of the choices, so the
 * description gives the range. Value mode is not checked, so the callbacks check again: a value saved against a larger
 * count than the config now has would otherwise reach the router.
 */
function numberedChoices(label: string, count: number): DropdownChoice<number>[] {
	return Array.from({ length: count }, (_, i) => ({ id: i + 1, label: `${label} ${i + 1}` }))
}

/** @param count the configured destination count */
export function destinationOption(count: number): CompanionInputFieldDropdown<'dst', number> {
	const choices = numberedChoices('Destination', count)
	return {
		id: 'dst',
		type: 'dropdown',
		label: 'Destination',
		choices,
		default: choices[0].id,
		expressionDescription: `Should return a destination number, 1 to ${count}`,
	}
}

/** For setting a crosspoint, and the crosspoint feedback, where no source is a choice of its own */
export function crosspointSourceOption(count: number): CompanionInputFieldDropdown<'src', number> {
	const choices = [{ id: NO_SOURCE, label: 'No Source' }, ...numberedChoices('Source', count)]
	return {
		id: 'src',
		type: 'dropdown',
		label: 'Source',
		choices,
		// Source 1
		default: choices[1].id,
		expressionDescription: `Should return a source number, 1 to ${count}, or ${NO_SOURCE} for no source`,
	}
}

/** For the input actions, where the source is an input */
export function inputOption(count: number): CompanionInputFieldDropdown<'src', number> {
	const choices = numberedChoices('Source', count)
	return {
		id: 'src',
		type: 'dropdown',
		label: 'Source',
		choices,
		default: choices[0].id,
		expressionDescription: `Should return a source number, 1 to ${count}`,
	}
}

/**
 * The ids are the control characters of the 1.x module's requests, saved against every button using the action. Remove
 * is sent as a set to {@link NO_SOURCE}, as it was then.
 */
export enum CrosspointMethod {
	Set = 'S',
	Remove = 'R',
	Interrogate = 'I',
}

export const METHOD_CHOICES = [
	{ id: CrosspointMethod.Set, label: 'SET' },
	{ id: CrosspointMethod.Remove, label: 'REMOVE' },
	{ id: CrosspointMethod.Interrogate, label: 'INTERROGATE' },
] as const satisfies DropdownChoice<CrosspointMethod>[]

export const methodOption: CompanionInputFieldDropdown<'method', CrosspointMethod> = {
	id: 'method',
	type: 'dropdown',
	label: 'Method',
	choices: METHOD_CHOICES,
	default: METHOD_CHOICES[0].id,
	expressionDescription: `Should return ${METHOD_CHOICES.map(({ id }) => `'${id}'`).join(', ')}`,
}

export const GAIN_CHOICES = [
	{ id: 0, label: '0dB' },
	{ id: 1, label: '10dB' },
	{ id: 2, label: '20dB' },
	{ id: 3, label: '30dB' },
	{ id: 4, label: '40dB' },
	{ id: 5, label: '50dB' },
	{ id: 6, label: '60dB' },
	{ id: 7, label: '70dB' },
] as const satisfies DropdownChoice<number>[]

export const gainOption: CompanionInputFieldDropdown<'gain', number> = {
	id: 'gain',
	type: 'dropdown',
	label: 'Gain',
	choices: GAIN_CHOICES,
	default: GAIN_CHOICES[1].id,
	expressionDescription: `Should return a gain step, 0 to ${MAX_GAIN}, each 10 dB`,
}

export const P48_CHOICES = [
	{ id: P48.Off, label: 'OFF' },
	{ id: P48.On, label: 'ON' },
] as const satisfies DropdownChoice<P48>[]

export const p48Option: CompanionInputFieldDropdown<'p48', P48> = {
	id: 'p48',
	type: 'dropdown',
	label: 'Phantom Power',
	choices: P48_CHOICES,
	default: P48_CHOICES[0].id,
	expressionDescription: `Should return ${P48.Off} for off, or ${P48.On} for on`,
}

export const delayOption: CompanionInputFieldNumber<'delay'> = {
	id: 'delay',
	type: 'number',
	label: 'Delay (ms)',
	default: 0,
	min: 0,
	max: MAX_DELAY_MS,
	range: true,
	step: 1,
	asInteger: true,
}

/** @param count the configured alarm count, which may be 0 */
export function alarmOption(count: number): CompanionInputFieldNumber<'alarm'> {
	return {
		id: 'alarm',
		type: 'number',
		label: 'Alarm',
		default: 1,
		min: 1,
		max: Math.max(count, 1),
		range: true,
		step: 1,
		asInteger: true,
	}
}

/** True for a whole number from min to max */
export function isInRange(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
