import {
	Address,
	ADDRESS_SEP,
	AppTag,
	Control,
	MAX_GAIN,
	MAX_INDEX,
	NO_SOURCE,
	NULL_PARAM,
	P48,
	PARAM_SEP,
	SOM,
} from './consts.js'

export interface Message {
	/** The message as sent, less the EOM */
	readonly text: string
	/**
	 * Messages waiting to be sent that share a key go as one, in the first one's place with the newest one's text. Each
	 * setting of one thing on one destination or source has its own key, as only the last of several would be left
	 * standing, and each interrogate of a destination asks the same question. Anything else is keyed by its text, so is
	 * merged only with a copy of itself.
	 */
	readonly key: string
}

function isWhole(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/** True for a whole number from 1 to {@link MAX_INDEX} */
export function isIndex(value: unknown): value is number {
	return isWhole(value, 1, MAX_INDEX)
}

export function isGain(value: unknown): value is number {
	return isWhole(value, 0, MAX_GAIN)
}

export function isP48(value: unknown): value is P48 {
	return value === P48.Off || value === P48.On
}

/** A delay in ms. The protocol's own limit is not known, so this only checks for a whole number that isn't negative */
export function isDelay(value: unknown): value is number {
	return isWhole(value, 0, Number.MAX_SAFE_INTEGER)
}

/**
 * @throws RangeError when the check fails. A message with a bad parameter is never sent
 */
function check<T>(value: T, valid: (value: unknown) => boolean, what: string): T {
	if (!valid(value)) throw new RangeError(`${String(value)} is not a valid ${what}`)
	return value
}

function message(
	control: Control,
	tag: AppTag,
	params: readonly (string | number)[],
	address?: Address,
	key?: string,
): Message {
	const text = SOM + control + tag + params.join(PARAM_SEP) + (address === undefined ? '' : ADDRESS_SEP + address)
	return { text, key: key ?? text }
}

/** Routes a source to a destination. {@link NO_SOURCE} removes the crosspoint */
export function setCrosspoint(destination: number, source: number): Message {
	check(destination, isIndex, 'destination')
	check(source, (value) => value === NO_SOURCE || isIndex(value), 'source')
	return message(
		Control.ReqSet,
		AppTag.Crosspoint,
		[destination, source],
		Address.Crosspoint,
		`crosspoint ${destination}`,
	)
}

export function removeCrosspoint(destination: number): Message {
	return setCrosspoint(destination, NO_SOURCE)
}

/** Asks for the source on a destination. The router answers with an {@link Control.AckSet} */
export function interrogateCrosspoint(destination: number): Message {
	check(destination, isIndex, 'destination')
	return message(
		Control.ReqInterrogate,
		AppTag.Crosspoint,
		[destination, NULL_PARAM],
		Address.Crosspoint,
		`interrogate ${destination}`,
	)
}

/** Sets an input's microphone gain, in 10 dB steps from 0 to {@link MAX_GAIN} */
export function setGain(source: number, gain: number): Message {
	check(source, isIndex, 'source')
	check(gain, isGain, 'gain')
	return message(Control.ReqGainSet, AppTag.Crosspoint, [source, gain], Address.Gain, `gain ${source}`)
}

export function setP48(source: number, p48: P48): Message {
	check(source, isIndex, 'source')
	check(p48, isP48, 'phantom power setting')
	return message(Control.ReqP48Set, AppTag.Crosspoint, [source, p48], Address.P48, `p48 ${source}`)
}

/** Sets an input's delay, in ms */
export function setDelay(source: number, delay: number): Message {
	check(source, isIndex, 'source')
	check(delay, isDelay, 'delay')
	return message(Control.ReqDelaySet, AppTag.Crosspoint, [source, delay], Address.Delay, `delay ${source}`)
}

/** Asks the router to notify this connection of crosspoint changes */
export function crosspointNotificationRequest(): Message {
	return message(Control.ReqNotification, AppTag.Crosspoint, [1, 1])
}

/** Asks for alive notifications. Also serves as the keepalive */
export function aliveNotificationRequest(): Message {
	return message(Control.ReqNotification, AppTag.Alive, [1, 0])
}

/** Asks the router to notify this connection of alarms */
export function alarmNotificationRequest(): Message {
	return message(Control.ReqNotification, AppTag.Alarm, [1, 1])
}
