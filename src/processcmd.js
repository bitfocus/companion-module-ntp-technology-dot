const { paramSep, addrSep, SOM, control, appTag } = require('./consts.js')

module.exports = {
	async processCmd(chunk) {
		let reply = chunk
		let varList = []
		while (reply[0] != SOM) {
			reply = reply.slice(1)
		}
		let ctrl = reply[1]
		let tag = reply[2]
		let params = reply.slice(3)
		params = params.split(paramSep)
		let src = parseInt(params[1])
		let dst = parseInt(params[0])
		let address = params[params.length - 1].split(addrSep)
		address = address[1].toString()
		this.log('debug', `control ${ctrl} tag ${tag} param 1 ${params[0]} param 2 ${params[1]} address ${address}`)
		if (ctrl == control.errSyntax) {
			this.log('warn', 'Unit Responded Syntax Error')
			return undefined
		}
		switch (tag) {
			case appTag.alive:
				switch (ctrl) {
					case control.notificationReply:
						this.log('debug', `alive.notificationReply: ${reply}`)
						break
					case control.notifySet:
						this.log('debug', `alive.notifySet: ${reply}`)
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case appTag.alarm:
				switch (ctrl) {
					case control.notificationReply:
						this.log('debug', `alarm.notificationReply: ${reply}`)
						break
					case control.notifySet:
						this.log('debug', `alarm.notifySet: ${reply}`)
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			case appTag.crosspoint:
				switch (ctrl) {
					case control.ackSet:
						if (isNaN(src) || isNaN(dst)) {
							this.log('warn', `unexpected reply: ${reply} src: ${src} dst: ${dst}`)
							return undefined
						}
						this.connections[dst] = src
						varList[`dst${dst}`] = src
						this.setVariableValues(varList)
						this.updateFeedbacks('checkCrosspoint')
						break
					case control.faultSet:
						this.log('warn', `crosspoint.faultSet: ${reply}`)
						break
					case control.ackReset:
						this.log('info', `crosspoint.ackReset: ${reply}`)
						break
					case control.faultReset:
						this.log('warn', `crosspoint.faultReset: ${reply}`)
						break
					case control.notificationReply:
						this.log('info', `crosspoint.notificationReply: ${reply}`)
						break
					case control.invalidParam:
						this.log('warn', `crosspoint.invalidParam: ${reply}`)
						break
					default:
						this.log('warn', `Unexpected response from unit: ${reply}`)
				}
				break
			default:
				this.log('warn', `Unexpected response from unit: ${reply}`)
		}
	},
}
