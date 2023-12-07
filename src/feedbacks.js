const { combineRgb } = require('@companion-module/base')
const { paramSep, nullParam, SOM, control, appTag } = require('./consts.js')

module.exports = async function (self) {
	self.setFeedbackDefinitions({
		checkCrosspoint: {
			name: 'Crosspoint',
			type: 'boolean',
			label: 'Crosspoint',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'dst',
					type: 'dropdown',
					label: 'Destination',
					default: 1,
					choices: self.destinations,
				},
				{
					id: 'src',
					type: 'dropdown',
					label: 'Source',
					default: 1,
					choices: self.sources,
				},
			],
			callback: ({ options }) => {
				return self.connections[options.dst] == options.src
			},
			subscribe: async ({ options }) => {
				let cmd = SOM + control.reqInterrogate + appTag.crosspoint + options.dst + paramSep + nullParam
				self.addCmdtoQueue(cmd)
				//self.addCmdtoQueue(SOM + control.notifySet + appTag.crosspoint + options.dst + paramSep + options.src)
			},
			learn: async (feedback) => {
				let dst = parseInt(await self.parseVariablesInString(feedback.options.dst))
				if (isNaN(dst) || dst < 1 || dst > self.config.dst) {
					self.log('warn', `an invalid varible has been passed: ${dst}`)
					return undefined
				}
				const source = self.connections[dst]
				return {
					...feedback.options,
					src: source,
				}
			},
		},
		alarm: {
			name: 'Alarm',
			type: 'boolean',
			label: 'Alarm',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'alarm',
					type: 'number',
					label: 'Alarm',
					default: 1,
					min: 1,
					max: self.config.alarms,
					range: true,
					step: 1,
				},
			],
			callback: ({ options }) => {
				return self.alarms[options.alarm]
			},
		},
	})
}
