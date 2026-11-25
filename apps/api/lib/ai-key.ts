import type { AiKey } from '@tamery/ai/models'
import type { AiUsageScope } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { aiKeys } from '@tamery/db/schema'
import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { and, asc, eq } from 'drizzle-orm'

import { aiUsage } from './ai-usage'
import { credits } from './credits'

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
  has: async (userId: string) =>
    (await db.$count(aiKeys, enabledFor(userId))) > 0,
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

export type AiPayer = Awaited<ReturnType<typeof payForAi>>

/** Who pays for a chat call: the user's own keys, else Tamery's budget for Pro. `key` is the first of them, which the chat's helper calls run on. A call on a key is recorded as `ownKey`, so AI usage shows it while it never counts toward the budget or spends credits. */
export const payForAi = async (userId: string, refused: () => Error) => {
  const keys = await aiKey.enabled(userId)
  const [key = null] = keys
  if (!(key || (await credits.canUseAi(userId)))) {
    throw refused()
  }
  const scoped = (scope: AiUsageScope) => ({ ...scope, ownKey: !!key })
  return {
    key,
    keys,
    recordJev:
      (scope: AiUsageScope) =>
      (usage: Parameters<typeof aiUsage.recordPriced>[1]) =>
        aiUsage.recordPriced(scoped(scope), usage),
    telemetry: (scope: AiUsageScope) => aiUsage.telemetry(scoped(scope)),
  }
}
