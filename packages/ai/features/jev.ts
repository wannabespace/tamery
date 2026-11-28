import { APICallError } from 'ai'
import { type } from 'arktype'

import { env } from '../env'
import type { AiUsageRecord } from '../usage/record'

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
export const JEV_MODEL = 'typesafe/jev-1.14'
const JEV_TIMEOUT_MS = 5000

const jevResponse = type({
  answers: 'Record<string, object>',
  model: 'string',
  usage: { cost: 'number', input_tokens: 'number', output_tokens: 'number' },
})

export type JevUsage = Pick<
  AiUsageRecord,
  'cost' | 'inputTokens' | 'model' | 'outputTokens'
>

/** Asks Jev, TypeSafe's decision model on OpenRouter, and reports its usage. Throws when it fails or takes too long, so each caller keeps its own fallback. */
export const askJev = async (data: {
  /** A user's own OpenRouter key; Tamery's account otherwise. */
  apiKey?: string
  onUsage: (usage: JevUsage) => Promise<void>
  questions: Record<string, object>
  signal?: AbortSignal
  state: Record<string, string>
}) => {
  const response = await fetch(DECISIONS_URL, {
    body: JSON.stringify({
      model: JEV_MODEL,
      questions: data.questions,
      state: data.state,
    }),
    headers: {
      Authorization: `Bearer ${data.apiKey ?? env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.any([
      AbortSignal.timeout(JEV_TIMEOUT_MS),
      ...(data.signal ? [data.signal] : []),
    ]),
  })
  if (!response.ok) {
    throw new APICallError({
      message: `Jev answered ${response.status}`,
      requestBodyValues: {},
      statusCode: response.status,
      url: DECISIONS_URL,
    })
  }
  const jev = jevResponse.assert(await response.json())
  await data.onUsage({
    cost: jev.usage.cost,
    inputTokens: jev.usage.input_tokens,
    model: jev.model,
    outputTokens: jev.usage.output_tokens,
  })
  return jev.answers
}
