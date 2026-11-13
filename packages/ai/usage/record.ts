import { runInBackground } from '@tamery/shared/background'
import type { LanguageModelUsage, ProviderMetadata, TelemetryOptions } from 'ai'

import { getModelCost } from '../models/price'
import type { AiFeature } from './feature'

export interface AiUsageScope {
  chatId?: string
  feature: AiFeature
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

const openRouterCost = (metadata?: ProviderMetadata) => {
  const usage = metadata?.openrouter?.usage
  return usage &&
    typeof usage === 'object' &&
    'cost' in usage &&
    typeof usage.cost === 'number'
    ? usage.cost
    : undefined
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
  const record = async (
    scope: AiUsageScope,
    modelId: string,
    usage: LanguageModelUsage,
    providerCost?: number
  ) => {
    try {
      await onRecord({
        ...scope,
        cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
        cost: providerCost ?? (await getModelCost(modelId, usage)),
        inputTokens: usage.inputTokens ?? 0,
        model: modelId,
        outputTokens: usage.outputTokens ?? 0,
      })
    } catch (error) {
      console.error('ai usage record failed', error)
    }
  }
  return {
    record,
    /** For a call the AI SDK does not see, priced by its own provider. */
    recordPriced: async (
      scope: AiUsageScope,
      priced: Pick<
        AiUsageRecord,
        'cost' | 'inputTokens' | 'model' | 'outputTokens'
      >
    ) => {
      try {
        await onRecord({
          ...scope,
          ...priced,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })
      } catch (error) {
        console.error('ai usage record failed', error)
      }
    },
    telemetry: (scope: AiUsageScope) =>
      usageTelemetry((modelId, usage, providerCost) =>
        record(scope, modelId, usage, providerCost)
      ),
  }
}
