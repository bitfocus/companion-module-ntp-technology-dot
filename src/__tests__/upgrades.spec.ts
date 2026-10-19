import { describe, expect, it } from 'vitest'
import type {
	CompanionMigrationAction,
	CompanionMigrationFeedback,
	CompanionStaticUpgradeProps,
	CompanionUpgradeContext,
} from '@companion-module/base'
import { UpgradeScripts, numericActionOptionsApi2, numericFeedbackOptionsApi2 } from '../upgrades.js'
import { ActionId } from '../actions.js'
import { FeedbackId } from '../feedbacks.js'
import type { ModuleConfig } from '../config.js'
import { actionDefinitions, fakeInstance, feedbackDefinitions } from './fixtures.js'

/**
 * Upgrade scripts are order-sensitive: a stored upgrade index records how far a configuration has been migrated,
 * so scripts may only ever be appended. Pin the index rather than taking the last entry, so appending a script
 * can't silently retarget this suite.
 */
const API2_SCRIPT_INDEX = 0
const EXPECTED_SCRIPT_COUNT = 1

// Options reach upgrade scripts already wrapped as ExpressionOrValue — Companion does that before running them
const v = (value: unknown) => ({ isExpression: false, value })

function action(actionId: string, options: Record<string, unknown>): CompanionMigrationAction {
	return {
		id: `action-${actionId}`,
		controlId: 'bank-1',
		actionId,
		options: options as CompanionMigrationAction['options'],
	}
}

function feedback(feedbackId: string, options: Record<string, unknown>): CompanionMigrationFeedback {
	return {
		id: `feedback-${feedbackId}`,
		controlId: 'bank-1',
		feedbackId,
		options: options as CompanionMigrationFeedback['options'],
	}
}

const savedConfig: ModuleConfig = {
	hostPri: '10.0.0.1',
	portPri: 10005,
	hostSec: '',
	portSec: 10005,
	redundant: false,
	src: 64,
	dst: 64,
	alarms: 24,
}

function run(
	actions: CompanionMigrationAction[],
	feedbacks: CompanionMigrationFeedback[] = [],
	config: ModuleConfig | null = null,
) {
	return UpgradeScripts[API2_SCRIPT_INDEX]({} as CompanionUpgradeContext<ModuleConfig>, {
		config,
		secrets: null,
		actions,
		feedbacks,
	} satisfies CompanionStaticUpgradeProps<ModuleConfig, undefined>)
}

describe('API 2.x upgrade script', () => {
	it('sits at the index this suite targets', () => {
		// Appending a script is fine — bump EXPECTED_SCRIPT_COUNT. Never insert, reorder or remove one.
		expect(UpgradeScripts).toHaveLength(EXPECTED_SCRIPT_COUNT)
	})

	it('converts custom destination and source strings from the old dropdowns to numbers', () => {
		const existing = action(ActionId.Crosspoint, { dst: v('3'), src: v('12'), method: v('S') })
		const result = run([existing])

		expect(result.updatedActions).toEqual([existing])
		expect(existing.options).toEqual({
			dst: { isExpression: false, value: 3 },
			src: { isExpression: false, value: 12 },
			method: { isExpression: false, value: 'S' },
		})
	})

	it('turns a variable into an expression', () => {
		const existing = action(ActionId.SourceGain, { src: v('$(internal:custom_src)'), gain: v('$(internal:gain)') })
		run([existing])

		expect(existing.options).toEqual({
			src: { isExpression: true, value: '$(internal:custom_src)' },
			gain: { isExpression: true, value: '$(internal:gain)' },
		})
	})

	it('wraps mixed text and variables in parseVariables', () => {
		const existing = action(ActionId.SourceDelay, { src: v('1$(internal:x)'), delay: v(20) })
		run([existing])

		expect(existing.options.src).toEqual({ isExpression: true, value: 'parseVariables("1$(internal:x)")' })
	})

	it('converts the source of the P48 action, but not its setting, which never took custom values', () => {
		const existing = action(ActionId.SourceP48, { src: v('4'), p48: v(1) })
		run([existing])

		expect(existing.options).toEqual({ src: { isExpression: false, value: 4 }, p48: { isExpression: false, value: 1 } })
	})

	it('does not report actions it had nothing to convert', () => {
		const choiceIds = action(ActionId.Crosspoint, { dst: v(4), src: v(0), method: v('R') })
		const alreadyExpression = action(ActionId.SourceGain, { src: { isExpression: true, value: '1 + 1' }, gain: v(2) })
		const missingOption = action(ActionId.Crosspoint, {})
		const unknown = action('no_such_action', { dst: v('3') })
		const result = run([choiceIds, alreadyExpression, missingOption, unknown])

		expect(result.updatedActions).toEqual([])
		expect(alreadyExpression.options.src).toEqual({ isExpression: true, value: '1 + 1' })
	})

	it('converts the crosspoint feedback, and leaves the alarm feedback', () => {
		const crosspoint = feedback(FeedbackId.Crosspoint, { dst: v('$(internal:d)'), src: v('5') })
		const alarm = feedback(FeedbackId.Alarm, { alarm: v(3) })
		const result = run([], [crosspoint, alarm])

		expect(result.updatedFeedbacks).toEqual([crosspoint])
		expect(crosspoint.options).toEqual({
			dst: { isExpression: true, value: '$(internal:d)' },
			src: { isExpression: false, value: 5 },
		})
	})

	it('leaves the config alone', () => {
		expect(run([], [], savedConfig).updatedConfig).toBeNull()
	})
})

type DefinitionLike = { options: { id: string; type: string; choices?: { id: unknown }[] }[] } | false | undefined

describe('upgrade maps match the current definitions', () => {
	const actionDefs: Record<string, DefinitionLike> = actionDefinitions(fakeInstance())
	const feedbackDefs: Record<string, DefinitionLike> = feedbackDefinitions(fakeInstance())

	// The script stores numbers, so each converted option must still hold a number: a number field, or a dropdown
	// whose choice ids are numbers
	const numericOptionIds = (def: DefinitionLike) =>
		def
			? def.options
					.filter(
						(o) =>
							o.type === 'number' ||
							(o.type === 'dropdown' && o.choices !== undefined && o.choices.every((c) => typeof c.id === 'number')),
					)
					.map((o) => o.id)
			: []

	it('defines every action and feedback id in the enums', () => {
		expect(Object.keys(actionDefs).sort()).toEqual(Object.values(ActionId).sort())
		expect(Object.keys(feedbackDefs).sort()).toEqual(Object.values(FeedbackId).sort())
	})

	it('keeps the ids saved on buttons', () => {
		expect(Object.values(ActionId).sort()).toEqual(['crosspoint', 'source_delay', 'source_gain', 'source_p48'])
		expect(Object.values(FeedbackId).sort()).toEqual(['alarm', 'checkCrosspoint'])
	})

	it.each(Object.entries(numericActionOptionsApi2))('action %s: converted options hold numbers', (id, keys) => {
		expect(numericOptionIds(actionDefs[id])).toEqual(expect.arrayContaining(keys))
	})

	it.each(Object.entries(numericFeedbackOptionsApi2))('feedback %s: converted options hold numbers', (id, keys) => {
		expect(numericOptionIds(feedbackDefs[id])).toEqual(expect.arrayContaining(keys))
	})
})
