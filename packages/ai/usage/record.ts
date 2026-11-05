import { runInBackground } from '@tamery/shared/background'
import type { LanguageModelUsage, TelemetryOptions } from 'ai'

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

export const usageTelemetry = (
  onUsage: (modelId: string, usage: LanguageModelUsage) => Promise<void>
): TelemetryOptions => ({
  integrations: {
    onLanguageModelCallEnd: ({ modelId, usage }) =>
      runInBackground(onUsage(modelId, usage)),
  },
})

export const createAiUsage = (
  onRecord: (record: AiUsageRecord) => Promise<void>
) => {
  const record = async (
    scope: AiUsageScope,
    modelId: string,
    usage: LanguageModelUsage
  ) => {
    try {
      await onRecord({
        ...scope,
        cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
        cost: await getModelCost(modelId, usage),
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
    telemetry: (scope: AiUsageScope) =>
      usageTelemetry((modelId, usage) => record(scope, modelId, usage)),
  }
}
