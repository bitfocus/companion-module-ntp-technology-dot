const { InstanceBase, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades.js')
const UpdateActions = require('./actions.js')
const UpdateFeedbacks = require('./feedbacks.js')
const UpdateVariableDefinitions = require('./variables.js')
const config = require('./config.js')
const choices = require('./choices.js')
const util = require('./util.js')
const tcp = require('./tcp.js')
const processCmd = require('./processcmd.js')
const { EndSession, msgDelay } = require('./consts.js')

class NTP_DOT_PROTOCOL extends InstanceBase {
	constructor(internal) {
		super(internal)
		Object.assign(this, { ...config, ...util, ...tcp, ...processCmd, ...choices })
	}
	async init(config) {
		this.updateStatus('Starting')
		this.config = config
		this.keepAliveTimer = {}
		this.useSecondary = false
		this.cmdTimer = setTimeout(() => {
			this.processCmdQueue()
		}, msgDelay)
		this.cmdQueue = []
		this.initTCP()
		this.initVariables()
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		this.updateVariableValues()
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', `destroy. ID: ${this.id}`)
		clearTimeout(this.keepAliveTimer)
		clearTimeout(this.cmdTimer)
		this.keepAliveTimer = null
		this.cmdTimer = null
		if (this.socket) {
			await this.sendCommand(EndSession)
			this.socket.destroy()
		} else {
			this.updateStatus(InstanceStatus.Disconnected)
		}
	}

	updateVariableValues() {
		let varList = []
		for (let i = 1; i <= this.config.destinations; i++) {
			varList[`dst${i}`] = 'unknown'
		}
		this.setVariableValues(varList)
	}

	initVariables() {
		this.sources = [{ id: 0, label: 'No Source' }]
		this.destinations = []
		this.connections = []
		this.alarms = []
		for (let i = 1; i <= this.config.src; i++) {
			this.sources.push({ id: i, label: `Source ${i}` })
		}
		for (let i = 1; i <= this.config.dst; i++) {
			this.destinations.push({ id: i, label: `Destination ${i}` })
			this.connections[i] = 0
		}
		for (let i = 1; i <= this.config.alarms; i++) {
			this.alarms[i] = false
		}
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(NTP_DOT_PROTOCOL, UpgradeScripts)
