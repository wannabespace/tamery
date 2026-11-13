import { afterAll, expect, it, spyOn } from 'bun:test'

import { getModelCost } from './price'

const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
  Response.json({
    'claude-opus-5': {
      cache_creation_input_token_cost: 6.25e-6,
      cache_read_input_token_cost: 0.5e-6,
      input_cost_per_token: 5e-6,
      output_cost_per_token: 25e-6,
    },
    'claude-opus-5-5': {
      cache_creation_input_token_cost: 6.25e-6,
      cache_read_input_token_cost: 0.5e-6,
      input_cost_per_token: 5e-6,
      output_cost_per_token: 25e-6,
    },
    'openrouter/anthropic/claude-opus-5': {
      cache_creation_input_token_cost: 6.25e-6,
      cache_read_input_token_cost: 0.5e-6,
      input_cost_per_token: 5e-6,
      output_cost_per_token: 25e-6,
    },
  })
)

afterAll(() => {
  fetchSpy.mockRestore()
})

const usage = {
  inputTokenDetails: {
    cacheReadTokens: 400,
    cacheWriteTokens: 200,
    noCacheTokens: 600,
  },
  inputTokens: 1200,
  outputTokenDetails: { reasoningTokens: 0, textTokens: 100 },
  outputTokens: 100,
  totalTokens: 1300,
}

it('prices uncached, cached and output tokens separately', async () => {
  expect(await getModelCost('claude-opus-5', usage)).toBeCloseTo(
    600 * 5e-6 + 400 * 0.5e-6 + 200 * 6.25e-6 + 100 * 25e-6,
    10
  )
})

it('matches a dated model id against its base entry', async () => {
  expect(await getModelCost('claude-opus-5-20260101', usage)).toBeCloseTo(
    await (getModelCost('claude-opus-5', usage) as Promise<number>),
    10
  )
})

it('matches an OpenRouter model id against its openrouter entry', async () => {
  expect(await getModelCost('anthropic/claude-opus-5', usage)).toBeCloseTo(
    await (getModelCost('claude-opus-5', usage) as Promise<number>),
    10
  )
})

it('matches a dotted OpenRouter id and its variant against the bare entry', async () => {
  expect(
    await getModelCost('~anthropic/claude-opus-5.5:nitro', usage)
  ).toBeCloseTo(
    await (getModelCost('claude-opus-5', usage) as Promise<number>),
    10
  )
})

it('returns null for a model missing from the price sheet', async () => {
  expect(await getModelCost('unknown-model', usage)).toBeNull()
})
