const { Regex } = require('@companion-module/base')
//const { EndSession, paramSep } = require('./consts.js')
module.exports = {
	async configUpdated(config) {
		//let oldConfig = this.config
		this.config = config
		this.useSecondary = false
		this.initTCP()
		this.initVariables()
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
	},
	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'hostPri',
				label: 'Primary Host',
				width: 8,
				regex: Regex.HOSTNAME,
			},
			{
				type: 'textinput',
				id: 'portPri',
				label: 'Primary Port',
				default: 10005,
				width: 4,
				regex: Regex.PORT,
				tooltip: 'Default: 10005',
			},
			{
				type: 'textinput',
				id: 'hostSec',
				label: 'Secondary Host',
				width: 8,
				regex: Regex.HOSTNAME,
			},
			{
				type: 'textinput',
				id: 'portSec',
				label: 'Secondary Port',
				default: 10005,
				width: 4,
				regex: Regex.PORT,
				tooltip: 'Default: 10005',
			},
			{
				type: 'checkbox',
				id: 'redundant',
				label: 'Redundant Controllers',
				default: true,
				width: 4,
			},
			{
				type: 'number',
				id: 'sources',
				label: 'Sources',
				default: 256,
				width: 4,
				min: 1,
				max: 9999,
				range: true,
				step: 1,
			},
			{
				type: 'number',
				id: 'destinations',
				label: 'Destinations',
				default: 256,
				width: 4,
				min: 1,
				max: 9999,
				range: true,
				step: 1,
			},
			{
				type: 'number',
				id: 'alarms',
				label: 'Alarms',
				default: 24,
				width: 4,
				min: 1,
				max: 9999,
				range: true,
				step: 1,
			},
		]
	},
}
