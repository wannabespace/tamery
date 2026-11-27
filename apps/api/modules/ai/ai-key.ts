import type { AiKey } from '@tamery/ai/models'
import { TAMERY_ACCOUNT } from '@tamery/ai/models'
import type { AiUsageScope } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { aiKeys } from '@tamery/db/schema'
import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { and, asc, eq } from 'drizzle-orm'

import { credits } from '~/modules/billing/credits'

import { aiUsage } from './ai-usage'

const enabledFor = (userId: string) =>
  and(eq(aiKeys.userId, userId), eq(aiKeys.enabled, true))

const ofProvider = (userId: string, provider: AiKeyProvider) =>
  and(eq(aiKeys.userId, userId), eq(aiKeys.provider, provider))

export const aiKey = {
  /** The keys calls run on, the first connected first. */
  enabled: (userId: string): Promise<AiKey[]> =>
    db
      .select({ key: aiKeys.key, provider: aiKeys.provider })
      .from(aiKeys)
      .where(enabledFor(userId))
      .orderBy(asc(aiKeys.createdAt)),
  list: (userId: string) =>
    db
      .select({
        enabled: aiKeys.enabled,
        key: aiKeys.key,
        provider: aiKeys.provider,
      })
      .from(aiKeys)
      .where(eq(aiKeys.userId, userId))
      .orderBy(asc(aiKeys.createdAt)),
  remove: (userId: string, provider: AiKeyProvider) =>
    db.delete(aiKeys).where(ofProvider(userId, provider)),
  set: (userId: string, { key, provider }: AiKey) =>
    db
      .insert(aiKeys)
      .values({ key, provider, userId })
      .onConflictDoUpdate({
        set: { key },
        target: [aiKeys.userId, aiKeys.provider],
      }),
  setEnabled: (userId: string, provider: AiKeyProvider, enabled: boolean) =>
    db.update(aiKeys).set({ enabled }).where(ofProvider(userId, provider)),
}

/** Who pays for a call: the user's own keys, else Tamery. `key` is the first of them, which the chat's helper calls run on. A user with a key runs every call on one of their keys, so each is recorded as `ownKey`: AI usage shows it while it never counts toward the budget or spends credits. */
const getAiPayer = (keys: AiKey[]) => {
  const [key = TAMERY_ACCOUNT] = keys
  const scoped = (scope: Omit<AiUsageScope, 'ownKey'>) => ({
    ...scope,
    ownKey: keys.length > 0,
  })
  return {
    key,
    keys,
    recordJev:
      (scope: Omit<AiUsageScope, 'ownKey'>) =>
      (usage: Parameters<typeof aiUsage.recordPriced>[1]) =>
        aiUsage.recordPriced(scoped(scope), usage),
    telemetry: (scope: Omit<AiUsageScope, 'ownKey'>) =>
      aiUsage.telemetry(scoped(scope)),
  }
}

export type AiPayer = ReturnType<typeof getAiPayer>

/** The payer of an AI call: the keys permissions were checked against, so a key turned off since never moves the call to Tamery, else Tamery while the plan's budget or credits last; null when neither pays. */
export const payForAi = async (context: {
  aiKeys: AiKey[]
  subscription: Parameters<typeof credits.canUseAi>[1]
  user: { id: string }
}) => {
  if (context.aiKeys.length > 0) {
    return getAiPayer(context.aiKeys)
  }
  return (await credits.canUseAi(context.user.id, context.subscription))
    ? getAiPayer([])
    : null
}
