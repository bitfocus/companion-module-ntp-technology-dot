import type { LogLevel } from '@companion-module/base'
import { Address, ADDRESS_SEP, AppTag, Control, EOM, MAX_LINE_LENGTH, PARAM_SEP, SOM } from './consts.js'

/** A crosspoint the router has reported, in reply to a set or interrogate or as a notification */
export interface CrosspointResponse {
	type: 'crosspoint'
	control: Control.AckSet | Control.AckReset | Control.NotifySet
	destination: number
	source: number
}

export interface AlarmResponse {
	type: 'alarm'
	index: number
	asserted: boolean
	/** The alarm's message, as configured on the router */
	text: string
}

export type Response =
	| CrosspointResponse
	| AlarmResponse
	/** Any message with the alive tag, which includes the answer to the keepalive */
	| { type: 'alive' }
	/** Anything else, which is only logged */
	| { type: 'other' }

export interface DecodedLine {
	response: Response
	level: LogLevel
	/** What to log for the line */
	message: string
}

const OTHER: Response = { type: 'other' }

function isEnumValue<T extends string>(values: Record<string, T>, value: string): value is T {
	return (Object.values(values) as string[]).includes(value)
}

const TAG_NAMES: Record<AppTag, string> = {
	[AppTag.Alarm]: 'alarm',
	[AppTag.Alive]: 'alive',
	[AppTag.Crosspoint]: 'crosspoint',
}

const CONTROL_NAMES: Partial<Record<Control, string>> = {
	[Control.AckSet]: 'ackSet',
	[Control.AckReset]: 'ackReset',
	[Control.InvalidParam]: 'invalidParam',
	[Control.FaultSet]: 'faultSet',
	[Control.FaultReset]: 'faultReset',
	[Control.NotificationReply]: 'notificationReply',
	[Control.NotifySet]: 'notifySet',
	[Control.NotifyReset]: 'notifyReset',
}

/** The level each reply is logged at, by control and tag. A control not listed is not one a router sends */
const LOG_LEVELS: Partial<Record<Control, Record<AppTag, LogLevel>>> = {
	[Control.AckSet]: { [AppTag.Alarm]: 'info', [AppTag.Alive]: 'info', [AppTag.Crosspoint]: 'info' },
	[Control.AckReset]: { [AppTag.Alarm]: 'info', [AppTag.Alive]: 'info', [AppTag.Crosspoint]: 'info' },
	// The router has refused a request, which nothing else tells the user
	[Control.InvalidParam]: { [AppTag.Alarm]: 'warn', [AppTag.Alive]: 'warn', [AppTag.Crosspoint]: 'warn' },
	[Control.FaultSet]: { [AppTag.Alarm]: 'warn', [AppTag.Alive]: 'warn', [AppTag.Crosspoint]: 'info' },
	[Control.FaultReset]: { [AppTag.Alarm]: 'warn', [AppTag.Alive]: 'warn', [AppTag.Crosspoint]: 'info' },
	[Control.NotificationReply]: { [AppTag.Alarm]: 'info', [AppTag.Alive]: 'debug', [AppTag.Crosspoint]: 'info' },
	// An alarm notification is logged again, as asserted or removed, by whatever handles it
	[Control.NotifySet]: { [AppTag.Alarm]: 'debug', [AppTag.Alive]: 'debug', [AppTag.Crosspoint]: 'info' },
	[Control.NotifyReset]: { [AppTag.Alarm]: 'info', [AppTag.Alive]: 'info', [AppTag.Crosspoint]: 'info' },
}

const CROSSPOINT_CONTROLS = [Control.AckSet, Control.AckReset, Control.NotifySet] as const
const ALARM_CONTROLS = [Control.FaultSet, Control.FaultReset, Control.NotifySet] as const

function includes<T extends string>(list: readonly T[], value: string): value is T {
	return (list as readonly string[]).includes(value)
}

/** A parameter as a whole number of 0 or more. Lenient as parseInt is, as the 1.x module was */
function parseNumber(param: string | undefined): number | undefined {
	if (param === undefined) return undefined
	const value = Number.parseInt(param, 10)
	return Number.isInteger(value) && value >= 0 ? value : undefined
}

export interface ParsedLine {
	/** The line from SOM on */
	text: string
	control: string
	tag: string
	params: string[]
	/**
	 * One of the addresses this module puts on its requests, following the last {@link ADDRESS_SEP}. Undefined if there
	 * is none, which the 1.x module took to mean a crosspoint.
	 */
	address: Address | undefined
}

/**
 * Splits a line into its parts, without judging them. Only an address this module uses is split off, so that an alarm
 * message keeps any {@link ADDRESS_SEP} in its text. Anything else stays on the last parameter, where a number
 * followed by it still reads as the number.
 * @returns undefined for a line with no SOM
 */
export function parseLine(line: string): ParsedLine | undefined {
	const start = line.indexOf(SOM)
	if (start === -1) return undefined
	const text = line.slice(start)
	let body = text
	let address: Address | undefined
	const separator = body.lastIndexOf(ADDRESS_SEP)
	const candidate = body.slice(separator + 1).trim()
	if (separator !== -1 && isEnumValue(Address, candidate)) {
		address = candidate
		body = body.slice(0, separator)
	}
	return { text, control: body.charAt(1), tag: body.charAt(2), params: body.slice(3).split(PARAM_SEP), address }
}

/**
 * Makes sense of one line from the router
 * @returns undefined for a blank line, which needs no logging
 */
export function decodeLine(line: string): DecodedLine | undefined {
	const trimmed = line.trim()
	if (trimmed === '') return undefined
	const parsed = parseLine(trimmed)
	if (parsed === undefined)
		return { response: OTHER, level: 'debug', message: `Ignored text outside a message: ${trimmed}` }
	const { text, control, tag, params, address } = parsed
	const unexpected: DecodedLine = { response: OTHER, level: 'warn', message: `Unexpected response from unit: ${text}` }
	if (!isEnumValue(Control, control)) return unexpected
	if (control === Control.ErrSyntax) return { response: OTHER, level: 'warn', message: `Syntax error reply: ${text}` }
	const levels = LOG_LEVELS[control]
	if (levels === undefined || !isEnumValue(AppTag, tag)) return unexpected
	const level = levels[tag]
	const name = [TAG_NAMES[tag], address?.toLowerCase(), CONTROL_NAMES[control]].filter(Boolean).join('.')
	const message = `${name}: ${text}`

	if (tag === AppTag.Alive) return { response: { type: 'alive' }, level, message }

	// A reply to a gain, P48 or delay request has the crosspoint tag too. Only the address tells them apart, and a
	// message without one is taken to be about a crosspoint
	if (
		tag === AppTag.Crosspoint &&
		includes(CROSSPOINT_CONTROLS, control) &&
		(address === undefined || address === Address.Crosspoint)
	) {
		const destination = parseNumber(params[0])
		const source = parseNumber(params[1])
		if (destination === undefined || source === undefined) {
			return { response: OTHER, level: 'warn', message: `Unexpected reply, without a destination and source: ${text}` }
		}
		return { response: { type: 'crosspoint', control, destination, source }, level, message }
	}

	if (tag === AppTag.Alarm && includes(ALARM_CONTROLS, control)) {
		const index = parseNumber(params[0])
		const state = parseNumber(params[1])
		if (index === undefined || state === undefined) {
			return { response: OTHER, level: 'warn', message: `Unexpected alarm, without an index and state: ${text}` }
		}
		// The message is all that follows the state, commas and all
		const alarmText = params.slice(2).join(PARAM_SEP)
		return { response: { type: 'alarm', index, asserted: state !== 0, text: alarmText }, level, message }
	}

	return { response: OTHER, level, message }
}

const EOM_BYTE = EOM.charCodeAt(0)

/**
 * Splits what arrives from the router into lines. A line is decoded only once it is whole, so a character split across
 * two chunks is read correctly.
 */
export class LineReader {
	#pending = Buffer.alloc(0)

	/**
	 * @returns each whole line, less its EOM, and the number of bytes thrown away because a line ran past
	 * {@link MAX_LINE_LENGTH} without one
	 */
	push(chunk: Buffer): { lines: string[]; discarded: number } {
		const buffer = this.#pending.length > 0 ? Buffer.concat([this.#pending, chunk]) : chunk
		const lines: string[] = []
		let start = 0
		let end: number
		while ((end = buffer.indexOf(EOM_BYTE, start)) !== -1) {
			lines.push(buffer.toString('utf8', start, end))
			start = end + 1
		}
		const rest = buffer.subarray(start)
		if (rest.length > MAX_LINE_LENGTH) {
			this.#pending = Buffer.alloc(0)
			return { lines, discarded: rest.length }
		}
		// A copy, so the chunk it came from isn't kept alive
		this.#pending = Buffer.from(rest)
		return { lines, discarded: 0 }
	}

	reset(): void {
		this.#pending = Buffer.alloc(0)
	}
}
