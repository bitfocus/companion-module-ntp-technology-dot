//const { Regex } = require('@companion-module/base')
const { paramSep, addrSep, nullParam, SOM, control, appTag, addrCmd } = require('./consts.js')

module.exports = function (self) {
	self.setActionDefinitions({
		crosspoint: {
			name: 'Crosspoint',
			description: 'Set, reset or interrogate a crosspoint connection',
			options: [
				{
					id: 'src',
					type: 'dropdown',
					label: 'sources',
					default: 1,
					choices: self.sources,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Varible must return an integer src number',
				},
				{
					id: 'dst',
					type: 'dropdown',
					label: 'Destination',
					default: 1,
					choices: self.destinations,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Varible must return an integer dst number',
				},
				{
					id: 'method',
					type: 'dropdown',
					label: 'Method',
					choices: self.crosspoint_method,
					default: control.reqSet,
					allowCustom: false,
				},
			],
			callback: async ({ options }) => {
				let dst = parseInt(await self.parseVariablesInString(options.dst))
				let cmd = ''
				if (isNaN(dst) || dst > self.config.destinations) {
					self.log('warn', `an invalid dst varible has been passed: ${dst}`)
					return undefined
				}
				if (options.method == control.reqSet) {
					cmd = SOM + control.reqSet + appTag.crosspoint + dst + paramSep
					let src = parseInt(await self.parseVariablesInString(options.src))
					if (isNaN(src) || src > self.config.sources) {
						self.log('warn', `an invalid src varible has been passed: ${src} `)
						return undefined
					}
					cmd += src + addrSep + addrCmd.xpoint
				} else if (options.method == control.reqReset) {
					cmd = SOM + control.reqSet + appTag.crosspoint + dst + paramSep + '0' + addrSep + addrCmd.xpoint
				} else {
					cmd = SOM + control.reqInterrogate + appTag.crosspoint + dst + paramSep + nullParam + addrSep + addrCmd.xpoint
				}
				self.addCmdtoQueue(cmd)
			},
			learn: async (action) => {
				let dst = parseInt(await self.parseVariablesInString(action.options.dst))
				if (isNaN(dst) || dst > self.config.destinations) {
					self.log('warn', `an invalid varible has been passed: ${dst}`)
					return undefined
				}
				const source = self.connections[dst]
				return {
					...action.options,
					src: source,
				}
			},
			subscribe: async (action) => {
				let cmd = SOM + control.reqInterrogate + appTag.crosspoint
				let dst = parseInt(await self.parseVariablesInString(action.options.dst))
				if (isNaN(dst) || dst > self.config.destinations) {
					self.log('warn', `an invalid varible has been passed: ${dst}`)
					return undefined
				}
				cmd += dst + paramSep + nullParam + addrSep + addrCmd.xpoint
				self.addCmdtoQueue(cmd)
			},
		},
	})
}
