import { describe, expect, it } from 'vitest'
import { Address, Control, decodeLine, LineReader, MAX_LINE_LENGTH, parseLine } from '../api/index.js'

describe('parseLine', () => {
	it('splits a line into control, tag, parameters and address', () => {
		expect(parseLine('.AC12,3*XPOINT')).toEqual({
			text: '.AC12,3*XPOINT',
			control: 'A',
			tag: 'C',
			params: ['12', '3'],
			address: Address.Crosspoint,
		})
	})

	it('starts at SOM, ignoring what comes before', () => {
		expect(parseLine('\n.NC4,2')?.text).toBe('.NC4,2')
	})

	it('takes the address from after the last separator', () => {
		expect(parseLine('.NA2,1,Fan * PSU*GAIN')).toMatchObject({
			params: ['2', '1', 'Fan * PSU'],
			address: Address.Gain,
		})
	})

	it('leaves text that is not one of its addresses in place', () => {
		expect(parseLine('.NA2,1,Fan * PSU')).toMatchObject({ params: ['2', '1', 'Fan * PSU'], address: undefined })
		expect(parseLine('.AC12,3*OTHER')).toMatchObject({ params: ['12', '3*OTHER'], address: undefined })
	})

	it('returns undefined for a line with no SOM', () => {
		expect(parseLine('hello')).toBeUndefined()
	})
})

describe('decodeLine', () => {
	it.each([
		['an ack', '.AC12,3*XPOINT', Control.AckSet],
		['an ack without an address', '.AC12,3', Control.AckSet],
		['an ack reset', '.aC12,0*XPOINT', Control.AckReset],
		['a notification', '.NC12,3', Control.NotifySet],
	])('reads a crosspoint from %s', (_name, line, control) => {
		expect(decodeLine(line)?.response).toEqual({
			type: 'crosspoint',
			control,
			destination: 12,
			source: Number(line.split(',')[1].split('*')[0]),
		})
	})

	it('logs a crosspoint ack at info, with the line', () => {
		expect(decodeLine('.AC12,3*XPOINT')).toMatchObject({
			level: 'info',
			message: 'crosspoint.xpoint.ackSet: .AC12,3*XPOINT',
		})
	})

	it.each([
		['gain', '.AC5,3*GAIN'],
		['P48', '.AC5,1*P48'],
		['delay', '.AC5,250*DELAY'],
	])('does not take the reply to a %s request for a crosspoint', (_name, line) => {
		expect(decodeLine(line)).toMatchObject({ response: { type: 'other' }, level: 'info' })
	})

	it('reads a crosspoint reply with an address it does not use as a crosspoint, as the 1.x module did', () => {
		expect(decodeLine('.AC12,3*OTHER')?.response).toMatchObject({ type: 'crosspoint', destination: 12, source: 3 })
	})

	it('reads a crosspoint with no source', () => {
		expect(decodeLine('.NC7,0')?.response).toMatchObject({ destination: 7, source: 0 })
	})

	// The 1.x module stored null for a source it could not read, without a warning
	it.each(['.AC5,x*XPOINT', '.AC5*XPOINT', '.AC,3*XPOINT', '.AC-1,3*XPOINT'])(
		'warns of a crosspoint reply %j with no destination or source',
		(line) => {
			expect(decodeLine(line)).toMatchObject({ response: { type: 'other' }, level: 'warn' })
		},
	)

	it.each([
		['fault set', '.FA3,1,PSU 2 failed', true],
		['fault reset', '.fA3,0,PSU 2 failed', false],
		['notification', '.NA3,1,PSU 2 failed', true],
		['notification of removal', '.NA3,0,PSU 2 failed', false],
	])('reads an alarm from a %s', (_name, line, asserted) => {
		expect(decodeLine(line)?.response).toEqual({ type: 'alarm', index: 3, asserted, text: 'PSU 2 failed' })
	})

	it('keeps commas and address separators in an alarm message', () => {
		expect(decodeLine('.NA3,1,Fan 1, rack 2')?.response).toMatchObject({ text: 'Fan 1, rack 2' })
		expect(decodeLine('.NA3,1,Fan*1')?.response).toMatchObject({ text: 'Fan*1' })
	})

	it('reads non-zero as asserted', () => {
		expect(decodeLine('.FA3,2,x')?.response).toMatchObject({ asserted: true })
	})

	it('warns of an alarm with no index or state', () => {
		expect(decodeLine('.FAx,1,text')).toMatchObject({ response: { type: 'other' }, level: 'warn' })
		expect(decodeLine('.FA3')).toMatchObject({ response: { type: 'other' }, level: 'warn' })
	})

	it.each(['.QZ1,0', '.AZ1,0', '.NZ1'])('reads %s as alive', (line) => {
		expect(decodeLine(line)?.response).toEqual({ type: 'alive' })
	})

	it('logs the reply to a notification request', () => {
		expect(decodeLine('.QC1,1')).toMatchObject({ response: { type: 'other' }, level: 'info' })
		expect(decodeLine('.QZ1,0')).toMatchObject({ level: 'debug' })
	})

	it('warns of a request the router refused', () => {
		expect(decodeLine('.eC5,9*GAIN')).toMatchObject({
			level: 'warn',
			message: 'crosspoint.gain.invalidParam: .eC5,9*GAIN',
		})
	})

	it('warns of a syntax error, whatever its tag', () => {
		expect(decodeLine('.E')).toMatchObject({ level: 'warn', message: 'Syntax error reply: .E' })
		expect(decodeLine('.EX12')).toMatchObject({ level: 'warn' })
	})

	it.each(['.XC1,1', '.AX1,1', '.A', '.'])('warns of %j, which is not a reply', (line) => {
		expect(decodeLine(line)).toMatchObject({ response: { type: 'other' }, level: 'warn' })
	})

	// The 1.x module looped forever on a line with no SOM, the empty line between two EOMs included
	it.each(['', ' ', '\n'])('skips blank line %j', (line) => {
		expect(decodeLine(line)).toBeUndefined()
	})

	it('logs text with no SOM at debug', () => {
		expect(decodeLine('Welcome')).toMatchObject({ response: { type: 'other' }, level: 'debug' })
	})
})

describe('LineReader', () => {
	it('splits on EOM, keeping a part line for the next chunk', () => {
		const reader = new LineReader()
		expect(reader.push(Buffer.from('.AC1,2*XPOINT\r.NC3'))).toEqual({ lines: ['.AC1,2*XPOINT'], discarded: 0 })
		expect(reader.push(Buffer.from(',4\r\r.QC1,1\r'))).toEqual({ lines: ['.NC3,4', '', '.QC1,1'], discarded: 0 })
	})

	it('decodes a character split across chunks', () => {
		const reader = new LineReader()
		const bytes = Buffer.from('.NA1,1,Kølerum\r')
		const split = bytes.indexOf(0xc3) + 1
		expect(reader.push(bytes.subarray(0, split)).lines).toEqual([])
		expect(reader.push(bytes.subarray(split)).lines).toEqual(['.NA1,1,Kølerum'])
	})

	it('discards a part line that runs too long, and carries on after', () => {
		const reader = new LineReader()
		expect(reader.push(Buffer.alloc(MAX_LINE_LENGTH + 1, 'x'))).toEqual({ lines: [], discarded: MAX_LINE_LENGTH + 1 })
		expect(reader.push(Buffer.from('.NC1,1\r')).lines).toEqual(['.NC1,1'])
	})

	it('forgets a part line on reset', () => {
		const reader = new LineReader()
		reader.push(Buffer.from('.NC1'))
		reader.reset()
		expect(reader.push(Buffer.from('.NC2,2\r')).lines).toEqual(['.NC2,2'])
	})
})
