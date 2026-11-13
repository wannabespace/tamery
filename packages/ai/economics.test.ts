import { expect, it } from 'bun:test'

import { CREDIT_TOP_UP } from '@tamery/shared/credits'

import {
  completionCost,
  filterCost,
  freeMonthCost,
  HEAVY,
  margin,
  MODELS,
  priced,
  proMonthCost,
  queryEditCost,
  topUpLoss,
  trialCost,
  TYPICAL,
} from './economics'

/**
 * Raising a number here costs money: rethink the change, or raise it on purpose and say why in the commit.
 * Each was measured with Pro at $10 / $100 (in brackets), with a little room for LiteLLM's prices moving.
 * A heavy Pro month is unbounded (Fix, Update, filters and completions have no Pro limit), so only its
 * single calls are held here.
 */
const BUDGET = {
  // One completion at every cap: 60k of schema, 30k before and after the caret ($0.0105).
  heaviestCompletionUsd: 0.012,
  // One AI filter over a 60k schema; its context has no cap at all ($0.04).
  heaviestFilterUsd: 0.045,
  // One Fix or Update at every cap: schema, editor, query and four images on Opus ($0.34).
  heaviestQueryEditUsd: 0.37,
  // A free account using its whole weekly filters and completions at every cap ($12.69).
  heavyFreeMonthUsd: 13.5,
  // Stripe keeps this share of the smallest top-up, sold 1:1 with model cost (9%).
  smallestTopUpLoss: 0.09,
  typicalFreeMonthUsd: 1.25,
  // $5 of chat, 40 Fix or Update, 40 filters, 1,500 completions (17% / 5%).
  typicalProMargin: { monthly: 0.14, yearly: 0.02 },
  // A trial spends the month's chat budget in its seven days ($5.61 typical).
  typicalTrialUsd: 6,
}

it('prices every model the API calls, fallbacks too', async () => {
  const costs = await Promise.all(
    MODELS.map((model) => priced(model, 1000, 1000))
  )
  for (const cost of costs) {
    expect(cost).toBeGreaterThan(0)
  }
})

it('keeps a typical Pro month its margin', async () => {
  const { total } = await proMonthCost(TYPICAL)
  expect(margin('monthly', total)).toBeGreaterThanOrEqual(
    BUDGET.typicalProMargin.monthly
  )
  expect(margin('yearly', total)).toBeGreaterThanOrEqual(
    BUDGET.typicalProMargin.yearly
  )
})

it('holds the dearest single calls to the budget', async () => {
  expect(await queryEditCost(HEAVY)).toBeLessThanOrEqual(
    BUDGET.heaviestQueryEditUsd
  )
  expect(await filterCost(HEAVY)).toBeLessThanOrEqual(BUDGET.heaviestFilterUsd)
  expect(await completionCost(HEAVY)).toBeLessThanOrEqual(
    BUDGET.heaviestCompletionUsd
  )
})

it('keeps a free account within the budget', async () => {
  expect(await freeMonthCost(TYPICAL)).toBeLessThanOrEqual(
    BUDGET.typicalFreeMonthUsd
  )
  expect(await freeMonthCost(HEAVY)).toBeLessThanOrEqual(
    BUDGET.heavyFreeMonthUsd
  )
})

it('keeps a typical trial within the budget', async () => {
  expect(await trialCost(TYPICAL)).toBeLessThanOrEqual(BUDGET.typicalTrialUsd)
})

it('loses no more than the budget to Stripe on the smallest top-up', () => {
  expect(topUpLoss(CREDIT_TOP_UP.min)).toBeLessThanOrEqual(
    BUDGET.smallestTopUpLoss
  )
})
