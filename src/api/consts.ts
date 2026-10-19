/**
 * The DOT protocol is line based ASCII. A message is SOM, a control character, an application tag, comma separated
 * parameters, and optionally ADDRESS_SEP and an address, ending with EOM:
 *
 *     .SC12,3*XPOINT\r     set crosspoint: source 3 to destination 12
 *
 * The router echoes the address in its reply, which is how replies to crosspoint, gain, P48 and delay requests are told
 * apart: all four use the crosspoint tag.
 */
export const SOM = '.'
export const EOM = '\r'
/** Sent on its own, without SOM, to end the session before closing the connection */
export const END_SESSION = 'exit'
/** Stands in for the parameter an interrogate asks for */
export const NULL_PARAM = '-'
export const PARAM_SEP = ','
export const ADDRESS_SEP = '*'

/** The highest source, destination or alarm number. The config fields have always been limited to it */
export const MAX_INDEX = 9999

/** The source number meaning no source, which removes a crosspoint */
export const NO_SOURCE = 0

/** Gain steps, each 10 dB */
export const MAX_GAIN = 7

/** The most input delay the action offers, in ms */
export const MAX_DELAY_MS = 1000

/** Least time from sending one message to sending the next */
export const MESSAGE_GAP_MS = 50

/** How long to wait for any reply from the router before sending the next message anyway */
export const ACK_TIMEOUT_MS = 1000

export const KEEPALIVE_INTERVAL_MS = 60000

/**
 * How long a router that has answered the keepalive before has to answer it again. Past this the connection is taken
 * to have gone, and is reopened, to the other controller if redundant.
 */
export const KEEPALIVE_TIMEOUT_MS = 10000

/** Matches TCPHelper's own default */
export const RECONNECT_INTERVAL_MS = 2000

/**
 * How long a connection attempt may take. TCPHelper has no limit of its own, which leaves it to the OS: an unreachable
 * controller then takes 20 s to over 2 minutes to fail, depending on the OS, before the other is tried.
 */
export const CONNECT_TIMEOUT_MS = 5000

/** A line longer than this with no EOM is not a DOT message, and is discarded */
export const MAX_LINE_LENGTH = 1024

/** Queue priorities: a higher one is sent first, and messages of the same priority go in the order queued */
export enum Priority {
	/** Queries on connecting, keepalives, and interrogates for feedbacks */
	Background = 0,
	/** Anything a user is waiting on, so a button press doesn't wait behind interrogations */
	Action = 1,
}

/** The control character, second in every message */
export enum Control {
	CmdSet = 's',
	CmdReset = 'r',
	ReqSet = 'S',
	ReqReset = 'R',
	ReqInterrogate = 'I',
	ReqNotification = 'Z',
	AckSet = 'A',
	AckReset = 'a',
	ErrSyntax = 'E',
	InvalidParam = 'e',
	FaultSet = 'F',
	FaultReset = 'f',
	NotificationReply = 'Q',
	NotifySet = 'N',
	NotifyReset = 'n',
	ReqGainSet = 'G',
	ReqGainGet = 'g',
	ReqP48Set = 'P',
	ReqP48Get = 'p',
	ReqDelaySet = 'D',
	ReqDelayGet = 'd',
}

/** The application tag, third in every message */
export enum AppTag {
	Alarm = 'A',
	Alive = 'Z',
	Crosspoint = 'C',
}

/** The addresses this module puts on its requests, which the router echoes in replies */
export enum Address {
	Delay = 'DELAY',
	Gain = 'GAIN',
	P48 = 'P48',
	Crosspoint = 'XPOINT',
}

export enum P48 {
	Off = 0,
	On = 1,
}
