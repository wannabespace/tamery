/**
 * What a month of Free, Pro and a trial costs in AI, estimated from the prompts, input caps and models the API
 * really uses and LiteLLM's prices (`getModelCost`), against what Pro and AI credit top-ups bring in after Stripe.
 * It counts no OpenRouter fee: the models run on Tamery's own provider keys (BYOK), free up to $25,000 of list price
 * a month; a call that falls back to OpenRouter's keys costs 5.5% more.
 * `economics.test.ts` holds the budget; `bun run economics` prints the table. Tokens are estimates at
 * 3.5 characters each (schemas and SQL), with no prompt caching.
 */
import process from 'node:process'

import {
  CREDIT_TOP_UP,
  PRO_INCLUDED_AI_USD,
  PRO_PRICE_USD,
  PRO_TRIAL_DAYS,
  topUpChargeCents,
} from '@tamery/shared/credits'
import { FREE_WEEKLY_LIMITS } from '@tamery/shared/usage'
import type { LanguageModelUsage } from 'ai'

import { DIAGNOSE_INSTRUCTIONS } from '../features/diagnose-connection'
import { filtersInstructions } from '../features/filters'
import { fixQueryInstructions } from '../features/fix-query'
import { updateQueryInstructions } from '../features/update-query'
import { AI_QUERY_LIMITS, DICTATION } from '../limits'
import { FIM_PRICED_ID, MODEL_IDS } from '../models/list'
import { getModelCost } from '../models/price'

const CHARS_PER_TOKEN = 3.5
const IMAGE_TOKENS = 1600
const AUDIO_TOKENS_PER_SECOND = 32
const SPOKEN_TOKENS_PER_SECOND = 3
const STRUCTURED_SCHEMA_TOKENS = 300
const FILTER_OUTPUT_TOKENS = 300
const DIAGNOSIS_OUTPUT_TOKENS = 300
const CONNECTION_SETTINGS_CHARS = 600
const DAYS = 30
const WEEKS_A_MONTH = DAYS / 7

const tokens = (chars: number) => chars / CHARS_PER_TOKEN

const usageOf = (input: number, output: number): LanguageModelUsage => ({
  inputTokenDetails: {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    noCacheTokens: input,
  },
  inputTokens: input,
  outputTokenDetails: { reasoningTokens: 0, textTokens: output },
  outputTokens: output,
  totalTokens: input + output,
})

export const priced = async (model: string, input: number, output: number) => {
  const cost = await getModelCost(model, usageOf(input, output))
  if (cost === null) {
    throw new Error(`${model} has no price in LiteLLM: see getModelCost`)
  }
  return cost
}

export const MODELS = [
  ...new Set([...Object.values(MODEL_IDS).flat(), FIM_PRICED_ID]),
]

/** How one account uses the AI: sizes of what it sends and how often a month. */
interface Use {
  chatUsd: number
  completionOutputTokens: number
  completions: number
  contextChars: number
  diagnoses: number
  dictationSeconds: number
  dictations: number
  editorChars: number
  errorChars: number
  filters: number
  images: number
  prefixChars: number
  promptChars: number
  queryChars: number
  queryEdits: number
  suffixChars: number
}

export const TYPICAL: Use = {
  chatUsd: 2,
  completionOutputTokens: 30,
  completions: 1500,
  contextChars: 8000,
  diagnoses: 2,
  dictationSeconds: 20,
  dictations: 10,
  editorChars: 3000,
  errorChars: 300,
  filters: 40,
  images: 0,
  prefixChars: 1000,
  promptChars: 150,
  queryChars: 1500,
  queryEdits: 40,
  suffixChars: 200,
}

/** Every size at its cap and far more use than anyone sensible: the most a month can cost. */
export const HEAVY: Use = {
  chatUsd: PRO_INCLUDED_AI_USD,
  completionOutputTokens: 200,
  completions: 10_000,
  contextChars: AI_QUERY_LIMITS.context,
  diagnoses: 30,
  dictationSeconds: DICTATION.seconds,
  dictations: 100,
  editorChars: AI_QUERY_LIMITS.query,
  errorChars: AI_QUERY_LIMITS.error,
  filters: 2000,
  images: AI_QUERY_LIMITS.images,
  prefixChars: AI_QUERY_LIMITS.query,
  promptChars: AI_QUERY_LIMITS.prompt,
  queryChars: AI_QUERY_LIMITS.query,
  queryEdits: 600,
  suffixChars: AI_QUERY_LIMITS.query,
}

const context = (use: Use) => 'x'.repeat(use.contextChars)

export const filterCost = (use: Use) =>
  priced(
    MODEL_IDS.structured[0],
    tokens(filtersInstructions(context(use)).length + use.promptChars) +
      STRUCTURED_SCHEMA_TOKENS,
    FILTER_OUTPUT_TOKENS
  )

/** The dearer of Fix and Update on the query model; either returns the whole query. */
export const queryEditCost = (use: Use) => {
  const data = { connectionType: 'postgres', context: context(use) }
  const query = use.editorChars + use.queryChars
  const fix = tokens(fixQueryInstructions(data).length + query + use.errorChars)
  const update =
    tokens(updateQueryInstructions(data).length + query + use.promptChars) +
    use.images * IMAGE_TOKENS
  return priced(
    MODEL_IDS.query[0],
    Math.max(fix, update),
    tokens(use.queryChars)
  )
}

export const completionCost = (use: Use) =>
  priced(
    FIM_PRICED_ID,
    tokens(use.contextChars + use.prefixChars + use.suffixChars),
    use.completionOutputTokens
  )

const diagnosisCost = (use: Use) =>
  priced(
    MODEL_IDS.structured[0],
    tokens(
      DIAGNOSE_INSTRUCTIONS.length + CONNECTION_SETTINGS_CHARS + use.errorChars
    ) + STRUCTURED_SCHEMA_TOKENS,
    DIAGNOSIS_OUTPUT_TOKENS
  )

const dictationCost = (use: Use) =>
  priced(
    MODEL_IDS.transcribe[0],
    use.dictationSeconds * AUDIO_TOKENS_PER_SECOND,
    use.dictationSeconds * SPOKEN_TOKENS_PER_SECOND
  )

const freeCap = (feature: keyof typeof FREE_WEEKLY_LIMITS, wanted: number) =>
  Math.min(wanted, FREE_WEEKLY_LIMITS[feature] * WEEKS_A_MONTH)

/** Filters and completions held to the weekly limits; diagnosis has none. No chat, Fix or Update. */
export const freeMonthCost = async (use: Use) =>
  freeCap('filters', use.filters) * (await filterCost(use)) +
  freeCap('complete', use.completions) * (await completionCost(use)) +
  use.diagnoses * (await diagnosisCost(use))

/** Every AI feature spends the included budget; past it, credits pay, so `total` stops there. */
export const proMonthCost = async (use: Use) => {
  const chat = use.chatUsd
  const filters = use.filters * (await filterCost(use))
  const completions = use.completions * (await completionCost(use))
  const queryEdits = use.queryEdits * (await queryEditCost(use))
  const other =
    use.diagnoses * (await diagnosisCost(use)) +
    use.dictations * (await dictationCost(use))
  return {
    chat,
    completions,
    filters,
    other,
    queryEdits,
    total: Math.min(
      chat + filters + completions + queryEdits + other,
      PRO_INCLUDED_AI_USD
    ),
  }
}

/** A trial gets the whole included budget in its days, and may never pay. */
export const trialCost = async (use: Use) => {
  const month = await proMonthCost(use)
  const other =
    month.filters + month.completions + month.queryEdits + month.other
  return Math.min(
    month.chat + (other * PRO_TRIAL_DAYS) / DAYS,
    PRO_INCLUDED_AI_USD
  )
}

const STRIPE_CARD_RATE = 0.029
const STRIPE_BILLING_RATE = 0.007
const STRIPE_FIXED_USD = 0.3
const MONTHS_A_YEAR = 12

type Interval = keyof typeof PRO_PRICE_USD

const monthsOf = (interval: Interval) =>
  interval === 'yearly' ? MONTHS_A_YEAR : 1

const grossRevenue = (interval: Interval) =>
  PRO_PRICE_USD[interval] / monthsOf(interval)

/** A yearly charge pays Stripe's fixed fee once for twelve months. */
const netRevenue = (interval: Interval) =>
  (PRO_PRICE_USD[interval] * (1 - STRIPE_CARD_RATE - STRIPE_BILLING_RATE) -
    STRIPE_FIXED_USD) /
  monthsOf(interval)

export const margin = (interval: Interval, aiUsd: number) =>
  (netRevenue(interval) - aiUsd) / grossRevenue(interval)

/** What a top-up of `credits` dollars keeps once they are spent, as a share of the charge. */
export const topUpMargin = (credits: number) => {
  const charge = topUpChargeCents(credits) / 100
  return (charge * (1 - STRIPE_CARD_RATE) - STRIPE_FIXED_USD - credits) / charge
}

const usd = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

const unitLines = async (name: string, use: Use) => [
  name,
  `  AI filter: ${usd(await filterCost(use))}`,
  `  completion: ${usd(await completionCost(use))}`,
  `  Fix / Update query: ${usd(await queryEditCost(use))}`,
  `  connection diagnosis: ${usd(await diagnosisCost(use))}`,
  `  dictation: ${usd(await dictationCost(use))}`,
]

const printReport = async () => {
  const lines = [
    `Models: ${MODELS.join(', ')}`,
    '',
    ...(await unitLines('Typical use', TYPICAL)),
    '',
    ...(await unitLines('Heavy use (every size at its cap)', HEAVY)),
    '',
    `Pro $${PRO_PRICE_USD.monthly}/mo or $${PRO_PRICE_USD.yearly}/yr: net ${usd(netRevenue('monthly'))} / ${usd(netRevenue('yearly'))} a month, ${usd(PRO_INCLUDED_AI_USD)} of AI included`,
  ]
  const months = await Promise.all(
    (
      [
        ['typical', TYPICAL],
        ['heavy', HEAVY],
      ] as const
    ).map(async ([name, use]) => ({ month: await proMonthCost(use), name }))
  )
  for (const { month, name } of months) {
    lines.push(
      `  ${name}: ${usd(month.total)} (chat ${usd(month.chat)}, Fix/Update ${usd(month.queryEdits)}, filters ${usd(month.filters)}, completions ${usd(month.completions)}, other ${usd(month.other)}), margin ${pct(margin('monthly', month.total))} / ${pct(margin('yearly', month.total))}`
    )
  }
  lines.push(
    '',
    `Trial (${PRO_TRIAL_DAYS} days): typical ${usd(await trialCost(TYPICAL))}, heavy ${usd(await trialCost(HEAVY))}`,
    `Free: typical ${usd(await freeMonthCost(TYPICAL))} a month, heavy ${usd(await freeMonthCost(HEAVY))} (${FREE_WEEKLY_LIMITS.filters} filters and ${FREE_WEEKLY_LIMITS.complete} completions a week)`,
    '',
    `Top-up margin with its ${pct(CREDIT_TOP_UP.fee)} fee: ${[...new Set([...CREDIT_TOP_UP.amounts, CREDIT_TOP_UP.autoTopUpAmount])].map((amount) => `$${amount} ${pct(topUpMargin(amount))}`).join(', ')}`
  )
  process.stdout.write(`${lines.join('\n')}\n`)
}

if (import.meta.main) {
  await printReport()
}
