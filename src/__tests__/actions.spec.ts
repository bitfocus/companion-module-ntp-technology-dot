import { describe, expect, it } from 'vitest'
import { ActionId } from '../actions.js'
import { P48 } from '../api/index.js'
import { CrosspointMethod } from '../options.js'
import { actionDefinitions, fakeInstance, learnAction, runAction, subscribeAction } from './fixtures.js'

/** The text of each message sent */
const sentTexts = (fake: ReturnType<typeof fakeInstance>) => fake.send.mock.calls.map(([message]) => message.text)

describe('Crosspoint', () => {
	it('sets the crosspoint, passing on the action signal', async () => {
		const fake = fakeInstance()
		const signal = new AbortController().signal
		await runAction(actionDefinitions(fake), ActionId.Crosspoint, { dst: 5, src: 3, method: 'S' }, signal)
		expect(sentTexts(fake)).toEqual(['.SC5,3*XPOINT'])
		expect(fake.send.mock.calls[0][1]).toBe(signal)
	})

	it('sets no source', async () => {
		const fake = fakeInstance()
		await runAction(actionDefinitions(fake), ActionId.Crosspoint, { dst: 5, src: 0, method: CrosspointMethod.Set })
		expect(sentTexts(fake)).toEqual(['.SC5,0*XPOINT'])
	})

	it('removes the crosspoint, whatever the source', async () => {
		const fake = fakeInstance()
		await runAction(actionDefinitions(fake), ActionId.Crosspoint, { dst: 5, src: 99, method: CrosspointMethod.Remove })
		expect(sentTexts(fake)).toEqual(['.SC5,0*XPOINT'])
	})

	it('interrogates the destination', async () => {
		const fake = fakeInstance()
		const signal = new AbortController().signal
		await runAction(actionDefinitions(fake), ActionId.Crosspoint, { dst: 2, src: 1, method: 'I' }, signal)
		expect(fake.interrogate).toHaveBeenCalledExactlyOnceWith(2, signal)
		expect(fake.send).not.toHaveBeenCalled()
	})

	it('interrogates for a method it does not know, as the 1.x module did', async () => {
		const fake = fakeInstance()
		await runAction(actionDefinitions(fake), ActionId.Crosspoint, { dst: 2, src: 1, method: 'X' })
		expect(fake.interrogate).toHaveBeenCalledExactlyOnceWith(2, expect.anything())
	})

	it('asks for its destination when subscribed, so a learn has it to hand', async () => {
		const fake = fakeInstance()
		const defs = actionDefinitions(fake)
		await subscribeAction(defs, ActionId.Crosspoint, { dst: 4, src: 1, method: 'S' })
		await subscribeAction(defs, ActionId.Crosspoint, { dst: 9, src: 1, method: 'S' })
		expect(fake.requestCrosspoint).toHaveBeenCalledExactlyOnceWith(4)
	})

	it('learns only the source', async () => {
		const fake = fakeInstance()
		fake.learnSource.mockResolvedValue(7)
		const signal = new AbortController().signal
		await expect(
			learnAction(actionDefinitions(fake), ActionId.Crosspoint, { dst: 4, src: 1, method: 'S' }, signal),
		).resolves.toEqual({ src: 7 })
		expect(fake.learnSource).toHaveBeenCalledExactlyOnceWith(4, signal)
	})

	it('learns nothing when the router does not say', async () => {
		const fake = fakeInstance()
		await expect(
			learnAction(actionDefinitions(fake), ActionId.Crosspoint, { dst: 4, src: 1, method: 'S' }),
		).resolves.toBeUndefined()
	})
})

describe('input actions', () => {
	it('Gain sends the gain step', async () => {
		const fake = fakeInstance()
		const signal = new AbortController().signal
		await runAction(actionDefinitions(fake), ActionId.SourceGain, { src: 3, gain: 4 }, signal)
		expect(sentTexts(fake)).toEqual(['.GC3,4*GAIN'])
		expect(fake.send.mock.calls[0][1]).toBe(signal)
	})

	it('P48 switches phantom power', async () => {
		const fake = fakeInstance()
		const defs = actionDefinitions(fake)
		await runAction(defs, ActionId.SourceP48, { src: 3, p48: P48.On })
		await runAction(defs, ActionId.SourceP48, { src: 3, p48: P48.Off })
		expect(sentTexts(fake)).toEqual(['.PC3,1*P48', '.PC3,0*P48'])
	})

	it('Delay sends the delay in ms', async () => {
		const fake = fakeInstance()
		await runAction(actionDefinitions(fake), ActionId.SourceDelay, { src: 16, delay: 1000 })
		expect(sentTexts(fake)).toEqual(['.DC16,1000*DELAY'])
	})
})

describe('refusals', () => {
	// Value mode is not validated by Companion, and a saved value can outlast a reduced count
	it.each([
		[ActionId.Crosspoint, { dst: 9, src: 1, method: 'S' }, /Destination 9 is not 1 to 8/],
		[ActionId.Crosspoint, { dst: 0, src: 1, method: 'I' }, /Destination 0/],
		[ActionId.Crosspoint, { dst: 1.5, src: 1, method: 'R' }, /Destination 1.5/],
		[ActionId.Crosspoint, { dst: '3', src: 1, method: 'S' }, /Destination 3/],
		[ActionId.Crosspoint, { dst: 1, src: 17, method: 'S' }, /Source 17 is not 0 to 16/],
		[ActionId.Crosspoint, { dst: 1, src: -1, method: 'S' }, /Source -1/],
		[ActionId.SourceGain, { src: 0, gain: 1 }, /Source 0 is not 1 to 16/],
		[ActionId.SourceGain, { src: 1, gain: 8 }, /Gain 8/],
		[ActionId.SourceGain, { src: 1, gain: '3' }, /Gain 3/],
		[ActionId.SourceP48, { src: 17, p48: 1 }, /Source 17/],
		[ActionId.SourceP48, { src: 1, p48: 2 }, /Phantom power 2/],
		[ActionId.SourceDelay, { src: 1, delay: 1001 }, /Delay 1001 is not 0 to 1000/],
		[ActionId.SourceDelay, { src: 1, delay: 2.5 }, /Delay 2.5/],
		[ActionId.SourceDelay, { src: 1, delay: -1 }, /Delay -1/],
	])('%s refuses %o and sends nothing', async (actionId, options, error) => {
		const fake = fakeInstance()
		await expect(runAction(actionDefinitions(fake), actionId, options)).rejects.toThrow(error)
		expect(fake.send).not.toHaveBeenCalled()
		expect(fake.interrogate).not.toHaveBeenCalled()
	})
})

describe('definitions', () => {
	it('offer each destination and source by number, with no source only for a crosspoint', () => {
		const defs = actionDefinitions(fakeInstance({ sources: 3, destinations: 2 }))
		const crosspoint = defs[ActionId.Crosspoint]
		const gain = defs[ActionId.SourceGain]
		if (!crosspoint || !gain) throw new Error('not defined')
		const choiceIds = (options: readonly { id: string; choices?: readonly { id: unknown }[] }[], id: string) =>
			options.flatMap((option) => (option.id === id ? (option.choices?.map((choice) => choice.id) ?? []) : []))
		expect(choiceIds(crosspoint.options, 'dst')).toEqual([1, 2])
		expect(choiceIds(crosspoint.options, 'src')).toEqual([0, 1, 2, 3])
		expect(choiceIds(gain.options, 'src')).toEqual([1, 2, 3])
	})

	it('no longer allow custom values, which expressions replace', () => {
		const defs = actionDefinitions(fakeInstance())
		for (const def of Object.values(defs)) {
			if (!def) continue
			for (const option of def.options) expect(option).not.toHaveProperty('allowCustom')
		}
	})
})
