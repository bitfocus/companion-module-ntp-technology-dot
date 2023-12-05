const { paramSep, addrSep, SOM, control, appTag, addrCmd } = require('./consts.js')

module.exports = {
	async processCmd(chunk) {
		let reply = chunk
		let varList = []
		while (reply[0] != SOM) {
			reply = reply.slice(1)
		}
		reply = reply.split(addrSep)
		let address = reply[1] === undefined ? 'NONE' : reply[1].toString()
		reply = reply[0]
		let ctrl = reply[1].toString()
		let tag = reply[2] === undefined ? '' : reply[2].toString()
		let params = reply.slice(3)
		params = params.split(paramSep)
		let src = isNaN(parseInt(params[1])) ? null : parseInt(params[1])
		let dst = isNaN(parseInt(params[0])) ? null : parseInt(params[0])
		let alarmIndex = dst
		let alarmState = src
		let alarmText = params[2] === undefined ? '' : params[2].toString()
		this.log('debug', `control ${ctrl} tag ${tag} param 1 ${params[0]} param 2 ${params[1]} address ${address}`)
		switch (ctrl) {
			case control.ackSet:
				switch (tag) {
					case appTag.alarm:
						this.log('info', `alarm.ackSet: ${reply}`)
						break
					case appTag.alive:
						this.log('info', `alive.ackSet: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.ackSet: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.ackSet: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.ackSet: ${reply}`)
								break
							case addrCmd.xpt:
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								this.log('info', `source.gain.ackSet: ${reply}`)
								if (isNaN(src) || isNaN(dst)) {
									this.log('warn', `unexpected reply: ${reply} src: ${src} dst: ${dst}`)
									return undefined
								}
								this.connections[dst] = src
								varList[`dst${dst}`] = src
						}
						this.setVariableValues(varList)
						this.updateFeedbacks('checkCrosspoint')
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case control.ackReset:
				switch (tag) {
					case appTag.alarm:
						this.log('info', `alarm.ackReset: ${reply}`)
						break
					case appTag.alive:
						this.log('info', `alive.ackReset: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.ackReset: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.ackReset: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.ackReset: ${reply}`)
								break
							case addrCmd.xpt:
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								this.log('info', `source.gain.ackReset: ${reply}`)
								if (isNaN(src) || isNaN(dst)) {
									this.log('warn', `unexpected reply: ${reply} src: ${src} dst: ${dst}`)
									return undefined
								}
								this.connections[dst] = src
								varList[`dst${dst}`] = src
						}
						this.setVariableValues(varList)
						this.updateFeedbacks('checkCrosspoint')
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case control.errSyntax:
				this.log('warn', `Reponse: Syntax Error:  ${reply}`)
				break
			case control.invalidParam:
				switch (tag) {
					case appTag.alarm:
						this.log('warn', `alarm.invalidParam: ${reply}`)
						break
					case appTag.alive:
						this.log('warn', `alive.invalidParam: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.invalidParam: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.invalidParam: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.invalidParam: ${reply}`)
								break
							case addrCmd.xpt:
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								this.log('info', `source.gain.invalidParam: ${reply}`)
						}
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case control.faultSet:
				switch (tag) {
					case appTag.alarm:
						this.log('warn', `alarm.faultSet: ${reply}`)
						this.alarms[alarmIndex] = !!alarmState
						if (this.alarms[alarmIndex]) {
							this.log('warn', `An Alarm has been asserted: ${alarmText}`)
						} else {
							this.log('info', `An Alarm has been removed: ${alarmText}`)
						}
						this.updateFeedbacks('alarm')
						break
					case appTag.alive:
						this.log('warn', `alive.faultSet: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.faultSet: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.faultSet: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.faultSet: ${reply}`)
								break
							case addrCmd.xpt:
								this.log('info', `crosspoint.XPOINT.faultSet: ${reply}`)
								break
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								this.log('info', `crosspoint.faultSet: ${reply}`)
						}
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case control.faultReset:
				switch (tag) {
					case appTag.alarm:
						this.log('warn', `alarm.faultReset: ${reply}`)
						this.alarms[alarmIndex] = !!alarmState
						if (this.alarms[alarmIndex]) {
							this.log('warn', `An Alarm has been asserted: ${alarmText}`)
						} else {
							this.log('info', `An Alarm has been removed: ${alarmText}`)
						}
						this.updateFeedbacks('alarm')
						break
					case appTag.alive:
						this.log('warn', `alive.faultReset: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.faultReset: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.faultReset: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.faultReset: ${reply}`)
								break
							case addrCmd.xpt:
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								this.log('info', `source.gain.faultReset: ${reply}`)
						}
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case control.notificationReply:
				switch (tag) {
					case appTag.alarm:
						this.log('info', `alarm.notificationReply: ${reply}`)
						break
					case appTag.alive:
						this.log('debug', `alive.notificationReply: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.notificationReply: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.notificationReply: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.notificationReply: ${reply}`)
								break
							case addrCmd.xpt:
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								this.log('info', `source.gain.notificationReply: ${reply}`)
						}
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case control.notifySet:
				switch (tag) {
					case appTag.alarm:
						this.log('debug', `alarm.notifySet: ${reply}`)
						this.alarms[alarmIndex] = !!alarmState
						if (this.alarms[alarmIndex]) {
							this.log('warn', `An Alarm has been asserted: ${alarmText}`)
						} else {
							this.log('info', `An Alarm has been removed: ${alarmText}`)
						}
						this.updateFeedbacks('alarm')
						break
					case appTag.alive:
						this.log('debug', `alive.notifySet: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.notifySet: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.notifySet: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.notifySet: ${reply}`)
								break
							case addrCmd.xpt:
								if (isNaN(src) || isNaN(dst)) {
									this.log('warn', `unexpected reply: ${reply} src: ${src} dst: ${dst}`)
									return undefined
								}
								this.connections[dst] = src
								varList[`dst${dst}`] = src
								this.log('info', `crosspoint.XPOINT.notifySet: ${reply}`)
								break
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								if (isNaN(src) || isNaN(dst)) {
									this.log('warn', `unexpected reply: ${reply} src: ${src} dst: ${dst}`)
									return undefined
								}
								this.connections[dst] = src
								varList[`dst${dst}`] = src
								this.log('info', `crosspoint.notifySet: ${reply}`)
						}
						this.setVariableValues(varList)
						this.updateFeedbacks('checkCrosspoint')
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case control.notifyReset:
				switch (tag) {
					case appTag.alarm:
						this.log('info', `alarm.notifyReset: ${reply}`)
						break
					case appTag.alive:
						this.log('info', `alive.notifyReset: ${reply}`)
						break
					case appTag.crosspoint:
						switch (address) {
							case addrCmd.delay:
								this.log('info', `crosspoint.delay.notifyReset: ${reply}`)
								break
							case addrCmd.gain:
								this.log('info', `source.gain.notifyReset: ${reply}`)
								break
							case addrCmd.p48:
								this.log('info', `source.p48.notifyReset: ${reply}`)
								break
							case addrCmd.xpt:
							case addrCmd.none:
							default:
								//assume crosspoint connect unless address indicates otherwise
								this.log('info', `source.gain.notifyReset: ${reply}`)
						}
						break
					default:
				}
				break
			default:
				this.log('warn', `Unexpected response from unit: ${reply}`)
		}
	},
}
