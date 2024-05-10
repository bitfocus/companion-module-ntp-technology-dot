const { Regex, InstanceStatus } = require('@companion-module/base')

module.exports = {
	async configUpdated(config) {
		this.config = config
		if (this.config.redundant) {
			if (this.config.hostSec == '' || this.config.portSec == '') {
				this.log('error', 'Secondary host / port not defined')
				this.updateStatus(InstanceStatus.BadConfig, 'Secondary not defined')
				return undefined
			}
		}
		this.useSecondary = false
		this.initTCP()
		this.initVariables()
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.updateVariableValues()
	},

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'hostPri',
				label: 'Primary Host',
				default: '',
				width: 8,
				regex: Regex.HOSTNAME,
				required: true,
			},
			{
				type: 'number',
				id: 'portPri',
				label: 'Primary Port',
				default: 10005,
				width: 4,
				min: 1,
				max: 65535,
				tooltip: 'Default: 10005',
				required: true,
			},
			{
				type: 'textinput',
				id: 'hostSec',
				label: 'Secondary Host',
				default: '',
				width: 8,
				regex: Regex.HOSTNAME,
			},
			{
				type: 'number',
				id: 'portSec',
				label: 'Secondary Port',
				default: 10005,
				width: 4,
				min: 1,
				max: 65535,
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
				id: 'src',
				label: 'Sources',
				default: 64,
				width: 4,
				min: 1,
				max: 9999,
				range: true,
				step: 1,
			},
			{
				type: 'number',
				id: 'dst',
				label: 'Destinations',
				default: 64,
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
				min: 0,
				max: 9999,
				range: true,
				step: 1,
			},
		]
	},
}
