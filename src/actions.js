import { paramSep, addrSep, nullParam, SOM, control, appTag, addrCmd } from './consts.js'

export default async function (self) {
	self.setActionDefinitions({
		crosspoint: {
			name: 'Crosspoint',
			description: 'Set, reset or interrogate a crosspoint connection',
			options: [
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
					id: 'src',
					type: 'dropdown',
					label: 'Source',
					default: 1,
					choices: self.sources,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Varible must return an integer src number',
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
				if (isNaN(dst) || dst < 1 || dst > self.config.dst) {
					self.log('warn', `an invalid dst varible has been passed: ${dst}`)
					return undefined
				}
				if (options.method == control.reqSet) {
					cmd = SOM + control.reqSet + appTag.crosspoint + dst + paramSep
					let src = parseInt(await self.parseVariablesInString(options.src))
					if (isNaN(src) || src < 0 || src > self.config.src) {
						self.log('warn', `an invalid src varible has been passed: ${src} `)
						return undefined
					}
					cmd += src + addrSep + addrCmd.xpt
				} else if (options.method == control.reqReset) {
					cmd = SOM + control.reqSet + appTag.crosspoint + dst + paramSep + '0' + addrSep + addrCmd.xpt
				} else {
					cmd = SOM + control.reqInterrogate + appTag.crosspoint + dst + paramSep + nullParam + addrSep + addrCmd.xpt
				}
				self.addCmdtoQueue(cmd)
			},
			learn: async (action) => {
				let dst = parseInt(await self.parseVariablesInString(action.options.dst))
				if (isNaN(dst) || dst < 1 || dst > self.config.dst) {
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
				if (isNaN(dst) || dst < 1 || dst > self.config.dst) {
					self.log('warn', `an invalid varible has been passed: ${dst}`)
					return undefined
				}
				cmd += dst + paramSep + nullParam + addrSep + addrCmd.xpt
				self.addCmdtoQueue(cmd)
				let src = parseInt(await self.parseVariablesInString(action.options.src))
				if (isNaN(src) || src < 0 || src > self.config.src) {
					self.log('warn', `an invalid src varible has been passed: ${src} `)
					return undefined
				}
			},
		},
		source_gain: {
			name: 'Input - Gain',
			description: 'Microphone Gain',
			options: [
				{
					id: 'src',
					type: 'dropdown',
					label: 'Source',
					default: 1,
					choices: self.sources,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Varible must return an integer src number',
				},
				{
					id: 'gain',
					type: 'dropdown',
					label: 'Gain',
					default: 1,
					choices: self.crosspoint_gain,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Varible must return an integer gain number between 0 and 7',
				},
			],
			callback: async ({ options }) => {
				let src = parseInt(await self.parseVariablesInString(options.src))
				let gain = parseInt(await self.parseVariablesInString(options.gain))
				if (isNaN(src) || src < 1 || src > self.config.src || isNaN(gain) || gain < 0 || gain > 7) {
					self.log('warn', `an invalid varible has been passed: src: ${src} gain: ${gain}`)
					return undefined
				}
				let cmd = SOM + control.reqGainSet + appTag.crosspoint + src + paramSep + options.gain + addrSep + addrCmd.gain
				self.addCmdtoQueue(cmd)
			},
		},
		source_p48: {
			name: 'Input - P48',
			description: 'Microphone Phantom Power',
			options: [
				{
					id: 'src',
					type: 'dropdown',
					label: 'Source',
					default: 1,
					choices: self.sources,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Varible must return an integer src number',
				},
				{
					id: 'p48',
					type: 'dropdown',
					label: 'Phantom Power',
					default: 0,
					choices: self.crosspoint_p48,
					useVariables: false,
					allowCustom: false,
				},
			],
			callback: async ({ options }) => {
				let src = parseInt(await self.parseVariablesInString(options.src))
				if (isNaN(src) || src < 1 || src > self.config.src) {
					self.log('warn', `an invalid varible has been passed: src: ${src}`)
					return undefined
				}
				let cmd = SOM + control.reqP48Set + appTag.crosspoint + src + paramSep + options.p48 + addrSep + addrCmd.p48
				self.addCmdtoQueue(cmd)
			},
		},
		source_delay: {
			name: 'Input - Delay',
			description: 'Input Delay',
			options: [
				{
					id: 'src',
					type: 'dropdown',
					label: 'Source',
					default: 1,
					choices: self.sources,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Varible must return an integer src number',
				},
				{
					id: 'delay',
					type: 'number',
					label: 'Delay (ms)',
					default: 0,
					min: 0,
					max: 1000,
					range: true,
					step: 1,
				},
			],
			callback: async ({ options }) => {
				let src = parseInt(await self.parseVariablesInString(options.src))
				if (isNaN(src) || src < 1 || src > self.config.src) {
					self.log('warn', `an invalid varible has been passed: src: ${src}`)
					return undefined
				}
				let cmd = SOM + control.reqDlySet + appTag.crosspoint + src + paramSep + options.delay + addrSep + addrCmd.delay
				self.addCmdtoQueue(cmd)
			},
		},
	})
}
