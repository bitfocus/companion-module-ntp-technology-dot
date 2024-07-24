import { combineRgb } from '@companion-module/base'
import { paramSep, nullParam, SOM, control, appTag } from './consts.js'

export default async function (self) {
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
					allowCustom: true,
					tooltip: 'Variable must return an integer dst number',
				},
				{
					id: 'src',
					type: 'dropdown',
					label: 'Source',
					default: 1,
					choices: self.sources,
					allowCustom: true,
					tooltip: 'Variable must return an integer src number',
				},
			],
			callback: async (feedback, context) => {
				const src = parseInt(await context.parseVariablesInString(feedback.options.src))
				const dst = parseInt(await context.parseVariablesInString(feedback.options.dst))
				if (isNaN(dst) || isNaN(src) || dst < 0 || src < 0 || dst > self.config.dst || src > self.config.src) {
					self.log('warn', `checkCrosspoint has been passed invalid variables src:${src} dst:${dst}`)
					return undefined
				}
				return self.connections[dst] == src
			},
			subscribe: async (feedback, context) => {
				const dst = parseInt(await context.parseVariablesInString(feedback.options.dst))
				if (isNaN(dst) || dst < 0 || dst > self.config.dst) {
					self.log('warn', `checkCrosspoint:subscribe has been passed invalid variables dst:${dst}`)
					return undefined
				}
				self.addCmdtoQueue(SOM + control.reqInterrogate + appTag.crosspoint + dst + paramSep + nullParam)
			},
			learn: async (feedback, context) => {
				const dst = parseInt(await context.parseVariablesInString(feedback.options.dst))
				if (isNaN(dst) || dst < 0 || dst > self.config.dst) {
					self.log('warn', `checkCrosspoint:learn has been passed invalid variables dst:${dst}`)
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
				return self.alarms[parseInt(options.alarm)]
			},
		},
	})
}
