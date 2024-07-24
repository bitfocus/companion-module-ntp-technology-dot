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
			subscribe: ({ options }) => {
				self.addCmdtoQueue(SOM + control.reqInterrogate + appTag.crosspoint + options.dst + paramSep + nullParam)
			},
			learn: (feedback) => {
				const source = self.connections[feedback.options.dst]
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
