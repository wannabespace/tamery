import { runInBackground } from '@tamery/shared/background'
import type { LanguageModelUsage, ProviderMetadata, TelemetryOptions } from 'ai'
import { type } from 'arktype'

import { getModelCost } from '../models/price'
import type { AiFeature } from './feature'

export interface AiUsageScope {
  chatId?: string
  feature: AiFeature
  /** Paid by the user's own provider key, so the cost is an estimate that spends nothing. */
  ownKey: boolean
  userId: string
}

export interface AiUsageRecord extends AiUsageScope {
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number | null
  inputTokens: number
  model: string
  outputTokens: number
}

const usageCost = type({
  cost: 'number',
  'costDetails?': { 'upstreamInferenceCost?': 'number | null' },
})

// With the provider's own key (BYOK) OpenRouter reports only its fee as `cost`, often 0, and the provider's bill apart; a total of 0 is a bill it left out, never a free call.
const openRouterCost = (metadata?: ProviderMetadata) => {
  const usage = usageCost(metadata?.openrouter?.usage)
  const total =
    usage instanceof type.errors
      ? 0
      : usage.cost + (usage.costDetails?.upstreamInferenceCost ?? 0)
  return total > 0 ? total : undefined
}

export const usageTelemetry = (
  onUsage: (
    modelId: string,
    usage: LanguageModelUsage,
    providerCost?: number
  ) => Promise<void>
): TelemetryOptions => ({
  integrations: {
    onLanguageModelCallEnd: ({ modelId, providerMetadata, usage }) =>
      runInBackground(
        onUsage(modelId, usage, openRouterCost(providerMetadata))
      ),
  },
})

export const createAiUsage = (
  onRecord: (record: AiUsageRecord) => Promise<void>
) => {
  const persist = async (
    build: () => AiUsageRecord | Promise<AiUsageRecord>
  ) => {
    try {
      await onRecord(await build())
    } catch (error) {
      console.error('ai usage record failed', error)
    }
  }
  const record = (
    scope: AiUsageScope,
    modelId: string,
    usage: LanguageModelUsage,
    providerCost?: number
  ) =>
    persist(async () => ({
      ...scope,
      cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
      cost: providerCost ?? (await getModelCost(modelId, usage)),
      inputTokens: usage.inputTokens ?? 0,
      model: modelId,
      outputTokens: usage.outputTokens ?? 0,
    }))
  return {
    record,
    /** For a call the AI SDK does not see, priced by its own provider. */
    recordPriced: (
      scope: AiUsageScope,
      priced: Pick<
        AiUsageRecord,
        'cost' | 'inputTokens' | 'model' | 'outputTokens'
      >
    ) =>
      persist(() => ({
        ...scope,
        ...priced,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      })),
    telemetry: (scope: AiUsageScope) =>
      usageTelemetry((modelId, usage, providerCost) =>
        record(scope, modelId, usage, providerCost)
      ),
  }
}
