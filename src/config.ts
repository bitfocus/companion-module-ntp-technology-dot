import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { MAX_INDEX } from './api/index.js'

export const DEFAULT_PORT = 10005

export type ModuleConfig = {
	hostPri: string
	portPri: number
	hostSec: string
	portSec: number
	/** Redundant controllers: the secondary is tried whenever a connection fails */
	redundant: boolean
	/** Source count */
	src: number
	/** Destination count */
	dst: number
	/** Alarm count */
	alarms: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'hostPri',
			label: 'Primary Host',
			default: '',
			width: 8,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'portPri',
			label: 'Primary Port',
			default: DEFAULT_PORT,
			width: 4,
			min: 1,
			max: 65535,
			asInteger: true,
			tooltip: `Default: ${DEFAULT_PORT}`,
		},
		{
			type: 'textinput',
			id: 'hostSec',
			label: 'Secondary Host',
			default: '',
			width: 8,
			regex: Regex.HOSTNAME,
			isVisibleExpression: '$(options:redundant)',
		},
		{
			type: 'static-text',
			id: 'place-holder-1',
			label: '',
			value: '',
			width: 8,
			isVisibleExpression: '!$(options:redundant)',
		},
		{
			type: 'number',
			id: 'portSec',
			label: 'Secondary Port',
			default: DEFAULT_PORT,
			width: 4,
			min: 1,
			max: 65535,
			asInteger: true,
			tooltip: `Default: ${DEFAULT_PORT}`,
			isVisibleExpression: '$(options:redundant)',
		},
		{
			type: 'static-text',
			id: 'place-holder-2',
			label: '',
			value: '',
			width: 4,
			isVisibleExpression: '!$(options:redundant)',
		},
		{
			type: 'checkbox',
			id: 'redundant',
			label: 'Redundant Controllers',
			default: false,
			width: 4,
		},
		{
			type: 'number',
			id: 'src',
			label: 'Sources',
			default: 64,
			width: 4,
			min: 1,
			max: MAX_INDEX,
			range: true,
			step: 1,
			asInteger: true,
		},
		{
			type: 'number',
			id: 'dst',
			label: 'Destinations',
			default: 64,
			width: 4,
			min: 1,
			max: MAX_INDEX,
			range: true,
			step: 1,
			asInteger: true,
		},
		{
			type: 'number',
			id: 'alarms',
			label: 'Alarms',
			default: 24,
			width: 4,
			min: 0,
			max: MAX_INDEX,
			range: true,
			step: 1,
			asInteger: true,
		},
	]
}

/**
 * A count from the config, made a whole number from min to {@link MAX_INDEX}. A saved config isn't checked against its
 * field's min and max, and a count drives loops over every destination.
 */
export function clampCount(count: unknown, min = 1): number {
	const value = Math.floor(Number(count))
	return Number.isNaN(value) ? min : Math.min(Math.max(value, min), MAX_INDEX)
}

/** The port from the config, or undefined if it is not one TCP can use */
export function validPort(port: unknown): number | undefined {
	const value = Number(port)
	return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : undefined
}
