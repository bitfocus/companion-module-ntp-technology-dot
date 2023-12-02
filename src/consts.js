export const regexpAddr = new RegExp(/^.{0,6}[^.*,`"]$/g)
export const msgDelay = 50
export const keepAliveInterval = 60000
//export const EndSession = 'QUIT' //'EXIT' also works
export const SOM = '.'
export const EOM = '\r'
export const nullParam = '-'
export const paramSep = ',' //seperator between parameters
export const addrSep = '*' //seperator at start of address
export const control = {
	cmdSet: 's',
	cmdReset: 'r',
	reqSet: 'S',
	reqReset: 'R',
	reqInterrogate: 'I',
	reqNotification: 'Z',
	ackSet: 'A',
	ackReset: 'a',
	errSyntax: 'E',
	invalidParam: 'e',
	faultSet: 'F',
	faultReset: 'f',
	notificationReply: 'Q',
	notifySet: 'N',
	notifyReset: 'n',
	reqGainSet: 'G',
	reqGainGet: 'g',
	reqP48Set: 'P',
	reqP48Get: 'p',
	reqDlySet: 'D',
	reqDlyGet: 'd',
}
export const appTag = {
	alarm: 'A',
	alive: 'Z',
	crosspoint: 'C',
}
export const addrCmd = {
	delay: 'DELAY',
	gain: 'GAIN',
	p48: 'P48',
	xpt: 'XPOINT',
	none: 'NONE',
}
