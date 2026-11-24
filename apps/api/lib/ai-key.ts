import type { AiKey } from '@tamery/ai/models'
import type { AiUsageScope } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { aiKeys } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'

import { aiUsage } from './ai-usage'
import { credits } from './credits'

export const aiKey = {
  get: async (userId: string): Promise<AiKey | null> => {
    const [row] = await db
      .select({ key: aiKeys.key, provider: aiKeys.provider })
      .from(aiKeys)
      .where(eq(aiKeys.userId, userId))
    return row ?? null
  },
  has: async (userId: string) =>
    (await db.$count(aiKeys, eq(aiKeys.userId, userId))) > 0,
  remove: (userId: string) =>
    db.delete(aiKeys).where(eq(aiKeys.userId, userId)),
  set: (userId: string, key: AiKey) =>
    db
      .insert(aiKeys)
      .values({ ...key, userId })
      .onConflictDoUpdate({ set: key, target: aiKeys.userId }),
}

export type AiPayer = Awaited<ReturnType<typeof payForAi>>

/** Who pays for a chat call: the user's own key, else Tamery's budget for Pro. A call on the key is recorded as `ownKey`, so AI usage shows it while it never counts toward the budget or spends credits. */
export const payForAi = async (userId: string, refused: () => Error) => {
  const key = await aiKey.get(userId)
  if (!(key || (await credits.canUseAi(userId)))) {
    throw refused()
  }
  const scoped = (scope: AiUsageScope) => ({ ...scope, ownKey: !!key })
  return {
    key,
    recordJev:
      (scope: AiUsageScope) =>
      (usage: Parameters<typeof aiUsage.recordPriced>[1]) =>
        aiUsage.recordPriced(scoped(scope), usage),
    telemetry: (scope: AiUsageScope) => aiUsage.telemetry(scoped(scope)),
  }
}
