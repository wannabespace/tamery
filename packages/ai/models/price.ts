import type { LanguageModelUsage } from 'ai'
import { memoize } from 'memoza'

const LITELLM_PRICES_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

export const fetchPrices = memoize(
  async () => {
    const response = await fetch(LITELLM_PRICES_URL)
    if (!response.ok) {
      throw new Error(`LiteLLM prices fetch failed: ${response.status}`)
    }
    return response.json() as Promise<
      Record<
        string,
        {
          cache_creation_input_token_cost?: number
          cache_read_input_token_cost?: number
          input_cost_per_token?: number
          output_cost_per_token?: number
        }
      >
    >
  },
  { maxAge: 24 * 60 * 60 * 1000, stale: true }
)

export const getModelCost = async (
  modelId: string,
  usage: LanguageModelUsage
) => {
  const prices = await fetchPrices().catch(() => null)
  const id = modelId.replace(/^~/u, '').replace(/:.*$/u, '')
  const name = id.split('/').at(-1) ?? id
  // LiteLLM keys OpenRouter's `anthropic/claude-opus-5.5` as `claude-opus-5-5` and `x-ai/grok-4.7` as `xai/grok-4.7`.
  const price =
    [
      `openrouter/${id}`,
      id,
      id.replace(/^[^/]+/u, (provider) => provider.replaceAll('-', '')),
      name,
      name.replaceAll('.', '-'),
      name.replace(/-\d{8}$/u, ''),
    ]
      .map((key) => prices?.[key])
      .find(Boolean) ?? null

  if (!price) {
    return null
  }

  const { cacheReadTokens = 0, cacheWriteTokens = 0 } = usage.inputTokenDetails

  return (
    (usage.inputTokenDetails.noCacheTokens ?? 0) *
      (price.input_cost_per_token ?? 0) +
    cacheReadTokens * (price.cache_read_input_token_cost ?? 0) +
    cacheWriteTokens * (price.cache_creation_input_token_cost ?? 0) +
    (usage.outputTokens ?? 0) * (price.output_cost_per_token ?? 0)
  )
}
