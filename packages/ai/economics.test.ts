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
  topUpMargin,
  trialCost,
  TYPICAL,
} from './economics'

/**
 * Raising a number here costs money: rethink the change, or raise it on purpose and say why in the commit.
 * Each was measured with Pro at $10 / $100, $5 of AI included and a 10% top-up fee (in brackets), with a
 * little room for LiteLLM's prices moving.
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
  // A Pro month that spends the whole included budget (41% / 33%).
  heavyProMargin: { monthly: 0.38, yearly: 0.3 },
  // What the smallest top-up keeps once Stripe and OpenRouter take theirs (-1.5%).
  smallestTopUpMargin: -0.02,
  typicalFreeMonthUsd: 1.25,
  // $2 of chat, 40 Fix or Update, 40 filters, 1,500 completions (45% / 38%).
  typicalProMargin: { monthly: 0.42, yearly: 0.35 },
  // A trial may spend the whole included budget in its seven days ($2.61 typical).
  typicalTrialUsd: 3,
}

it('prices every model the API calls, fallbacks too', async () => {
  const costs = await Promise.all(
    MODELS.map((model) => priced(model, 1000, 1000))
  )
  for (const cost of costs) {
    expect(cost).toBeGreaterThan(0)
  }
})

it.each([
  ['typical', TYPICAL, BUDGET.typicalProMargin],
  ['heavy', HEAVY, BUDGET.heavyProMargin],
] as const)('keeps a %s Pro month its margin', async (_, use, budget) => {
  const { total } = await proMonthCost(use)
  expect(margin('monthly', total)).toBeGreaterThanOrEqual(budget.monthly)
  expect(margin('yearly', total)).toBeGreaterThanOrEqual(budget.yearly)
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

it('keeps the smallest top-up its margin', () => {
  expect(topUpMargin(CREDIT_TOP_UP.min)).toBeGreaterThanOrEqual(
    BUDGET.smallestTopUpMargin
  )
})
