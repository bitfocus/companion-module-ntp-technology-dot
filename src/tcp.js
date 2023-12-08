const { InstanceStatus, TCPHelper } = require('@companion-module/base')
const { EndSession, msgDelay, SOM, EOM, keepAliveInterval, control, appTag, paramSep } = require('./consts.js')

module.exports = {
	async addCmdtoQueue(cmd) {
		if (cmd !== undefined && cmd.length > 5) {
			await this.cmdQueue.push(cmd)
			return true
		}
		this.log('warn', `Invalid command: ${cmd}`)
		return false
	},

	async processCmdQueue() {
		if (this.cmdQueue.length > 0 && this.clearToTx) {
			//dont send command if still waiting for response from last command
			this.sendCommand(await this.cmdQueue.splice(0, 1))
			this.cmdTimer = setTimeout(() => {
				this.processCmdQueue()
			}, msgDelay)
			return true
		}
		// run at double speed while the queue is empty for better responsiveness
		this.cmdTimer = setTimeout(() => {
			this.processCmdQueue()
		}, msgDelay / 2)
		return false
	},

	async sendCommand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.isConnected) {
				this.log('debug', `Sending Command: ${cmd}`)
				this.clearToTx = false
				this.socket.send(cmd + EOM)
				return true
			} else {
				this.log('warn', `Socket not connected, tried to send: ${cmd}`)
			}
		} else {
			this.log('warn', 'Command undefined')
		}
		return false
	},

	//queries made on initial connection.
	async queryOnConnect() {
		//request crosspoint notications
		this.addCmdtoQueue(SOM + control.reqNotification + appTag.crosspoint + 1 + paramSep + 1)
		//request alive notifications
		this.addCmdtoQueue(SOM + control.reqNotification + appTag.alive + 1 + paramSep + 0)
		//request alarm notifications
		this.addCmdtoQueue(SOM + control.reqNotification + appTag.alarm + 1 + paramSep + 1)
		return true
	},

	keepAlive() {
		//request alive notifications
		this.addCmdtoQueue(SOM + control.reqNotification + appTag.alive + 1 + paramSep + 0)
		this.keepAliveTimer = setTimeout(() => {
			this.keepAlive()
		}, keepAliveInterval)
	},

	initTCP() {
		this.receiveBuffer = ''
		if (this.socket !== undefined) {
			this.addCmdtoQueue(EndSession)
			this.socket.destroy()
			delete this.socket
		}
		if (this.config.hostPri) {
			this.log('debug', 'Creating New Socket')
			if (this.useSecondary && this.config.hostSec) {
				this.updateStatus('Connecting to Secondary')
				this.socket = new TCPHelper(this.config.hostSec, this.config.portSec)
			} else {
				this.updateStatus('Connecting to Primary')
				this.socket = new TCPHelper(this.config.hostPri, this.config.portPri)
			}
			this.socket.on('status_change', (status, message) => {
				this.updateStatus(status, message)
			})
			this.socket.on('error', (err) => {
				this.log('error', `Network error: ${err.message}`)
				this.clearToTx = true
				clearTimeout(this.keepAliveTimer)
				if (this.config.redundant) {
					this.useSecondary = !this.useSecondary
					this.initTCP()
				}
			})
			this.socket.on('connect', () => {
				if (this.useSecondary && this.config.hostSec) {
					this.log('info', `Connected on Secondary ${this.config.hostSec}:${this.config.portSec}`)
				} else {
					this.log('info', `Connected on Primary ${this.config.hostPri}:${this.config.portPri}`)
				}
				this.clearToTx = true
				this.queryOnConnect()
				this.keepAliveTimer = setTimeout(() => {
					this.keepAlive()
				}, keepAliveInterval)
			})
			this.socket.on('data', (chunk) => {
				this.clearToTx = true
				let i = 0,
					line = '',
					offset = 0
				this.receiveBuffer += chunk
				while ((i = this.receiveBuffer.indexOf(EOM, offset)) !== -1) {
					line = this.receiveBuffer.substr(offset, i - offset)
					offset = i + 1
					this.processCmd(line.toString())
				}
				this.receiveBuffer = this.receiveBuffer.substr(offset)
			})
		} else {
			this.updateStatus(InstanceStatus.BadConfig)
		}
	},
}
