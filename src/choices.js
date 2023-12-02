const { control } = require('./consts.js')
module.exports = {
	crosspoint_gain: [
		{ id: 0, label: '0dB' },
		{ id: 1, label: '10dB' },
		{ id: 2, label: '20dB' },
		{ id: 3, label: '30dB' },
		{ id: 4, label: '40dB' },
		{ id: 5, label: '50dB' },
		{ id: 6, label: '60dB' },
		{ id: 7, label: '70dB' },
	],
	crosspoint_p48: [
		{ id: 0, label: 'OFF' },
		{ id: 1, label: 'ON' },
	],
	crosspoint_method: [
		{ id: control.reqSet, label: 'SET' },
		{ id: control.reqReset, label: 'REMOVE' },
		{ id: control.reqInterrogate, label: 'INTERROGATE' },
	],
}
