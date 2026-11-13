import { type } from 'arktype'

import { env } from '../env'

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
export const JEV_MODEL = 'typesafe/jev-1.14'
const JEV_TIMEOUT_MS = 5000

const jevResponse = type({
  answers: 'Record<string, object>',
  model: 'string',
  usage: { cost: 'number', input_tokens: 'number', output_tokens: 'number' },
})

export interface JevUsage {
  cost: number
  inputTokens: number
  model: string
  outputTokens: number
}

/** Asks Jev, TypeSafe's decision model on OpenRouter, and reports its usage. Throws when it fails or takes too long, so each caller keeps its own fallback. */
export const askJev = async (data: {
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
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.any([
      AbortSignal.timeout(JEV_TIMEOUT_MS),
      ...(data.signal ? [data.signal] : []),
    ]),
  })
  if (!response.ok) {
    throw new Error(`Jev answered ${response.status}`)
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
