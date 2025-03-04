import { paramSep, addrSep, nullParam, SOM, control, appTag, addrCmd } from './consts.js'

export default async function (self) {
	const optionSrc = {
		id: 'src',
		type: 'dropdown',
		label: 'Source',
		default: 1,
		choices: self.sources,
		useVariables: true,
		allowCustom: true,
		tooltip: 'Variable must return an integer src number',
	}
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
					tooltip: 'Variable must return an integer dst number',
				},
				optionSrc,
				{
					id: 'method',
					type: 'dropdown',
					label: 'Method',
					choices: self.crosspoint_method,
					default: control.reqSet,
					allowCustom: false,
				},
			],
			callback: async ({ options }, context) => {
				const dst = parseInt(await context.parseVariablesInString(options.dst))
				let cmd
				if (isNaN(dst) || dst < 1 || dst > self.config.dst) {
					self.log('warn', `an invalid dst variable has been passed: ${dst}`)
					return undefined
				}
				if (options.method == control.reqSet) {
					cmd = SOM + control.reqSet + appTag.crosspoint + dst + paramSep
					let src = parseInt(await context.parseVariablesInString(options.src))
					if (isNaN(src) || src < 0 || src > self.config.src) {
						self.log('warn', `an invalid src variable has been passed: ${src} `)
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
			learn: async (action, context) => {
				const dst = parseInt(await context.parseVariablesInString(action.options.dst))
				if (isNaN(dst) || dst < 1 || dst > self.config.dst) {
					self.log('warn', `an invalid variable has been passed: ${dst}`)
					return undefined
				}
				const source = self.connections[dst]
				return {
					...action.options,
					src: source,
				}
			},
			subscribe: async (action, context) => {
				const dst = parseInt(await context.parseVariablesInString(action.options.dst))
				if (isNaN(dst) || dst < 1 || dst > self.config.dst) {
					self.log('warn', `an invalid variable has been passed: ${dst}`)
					return undefined
				}
				const cmd =
					SOM + control.reqInterrogate + appTag.crosspoint + dst + paramSep + nullParam + addrSep + addrCmd.xpt
				self.addCmdtoQueue(cmd)
			},
		},
		source_gain: {
			name: 'Input - Gain',
			description: 'Microphone Gain',
			options: [
				optionSrc,
				{
					id: 'gain',
					type: 'dropdown',
					label: 'Gain',
					default: 1,
					choices: self.crosspoint_gain,
					useVariables: true,
					allowCustom: true,
					tooltip: 'Variable must return an integer gain number between 0 and 7',
				},
			],
			callback: async ({ options }, context) => {
				const src = parseInt(await context.parseVariablesInString(options.src))
				const gain = parseInt(await context.parseVariablesInString(options.gain))
				if (isNaN(src) || src < 1 || src > self.config.src || isNaN(gain) || gain < 0 || gain > 7) {
					self.log('warn', `an invalid variable has been passed: src: ${src} gain: ${gain}`)
					return undefined
				}
				const cmd =
					SOM + control.reqGainSet + appTag.crosspoint + src + paramSep + options.gain + addrSep + addrCmd.gain
				self.addCmdtoQueue(cmd)
			},
		},
		source_p48: {
			name: 'Input - P48',
			description: 'Microphone Phantom Power',
			options: [
				optionSrc,
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
			callback: async ({ options }, context) => {
				const src = parseInt(await context.parseVariablesInString(options.src))
				if (isNaN(src) || src < 1 || src > self.config.src) {
					self.log('warn', `an invalid variable has been passed: src: ${src}`)
					return undefined
				}
				const cmd = SOM + control.reqP48Set + appTag.crosspoint + src + paramSep + options.p48 + addrSep + addrCmd.p48
				self.addCmdtoQueue(cmd)
			},
		},
		source_delay: {
			name: 'Input - Delay',
			description: 'Input Delay',
			options: [
				optionSrc,
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
			callback: async ({ options }, context) => {
				const src = parseInt(await context.parseVariablesInString(options.src))
				if (isNaN(src) || src < 1 || src > self.config.src) {
					self.log('warn', `an invalid variable has been passed: src: ${src}`)
					return undefined
				}
				const cmd =
					SOM + control.reqDlySet + appTag.crosspoint + src + paramSep + options.delay + addrSep + addrCmd.delay
				self.addCmdtoQueue(cmd)
			},
		},
	})
}
