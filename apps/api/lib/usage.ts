import { ORPCError } from '@orpc/server'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import type { MeteredFeature } from '@tamery/shared/usage'
import { FREE_WEEKLY_LIMITS, usageResetsAt } from '@tamery/shared/usage'

import type { permix } from '~/orpc'

import { payForAi } from './ai-key'
import { redis } from './redis'

const unlimitedPermission = {
  complete: 'ai.query.completeUnlimited',
  filters: 'ai.filter.unlimited',
  mcp: 'mcp.unlimited',
} as const satisfies Record<MeteredFeature, typeof permix.$inferPath>

const limitReachedMessage = {
  complete:
    'Weekly AI autocomplete limit reached. Upgrade to Pro for unlimited suggestions.',
  filters:
    'You have reached the free AI usage limit. Please subscribe to a Pro plan to continue using AI features.',
} as const satisfies Partial<Record<MeteredFeature, string>>

type UsageContext = ReturnType<typeof permix.setupContext> &
  Parameters<typeof payForAi>[0]

const getKey = (userId: string, feature: MeteredFeature, resetsAt: number) =>
  `usage:${userId}:${feature}:${resetsAt}`

const getQuota = (feature: MeteredFeature, used: number) => ({
  max: FREE_WEEKLY_LIMITS[feature],
  resetAt: new Date(usageResetsAt()),
  used,
})

const increment = async (userId: string, feature: MeteredFeature) => {
  const resetsAt = usageResetsAt()
  const key = getKey(userId, feature, resetsAt)
  const [used] = await redis
    .multi()
    .incr(key)
    .expireAt(key, new Date(resetsAt))
    .exec()
  return { release: () => redis.decr(key), used: Number(used) }
}

export const usage = {
  get: async ({ permissions, user }: UsageContext, feature: MeteredFeature) =>
    permissions.check(unlimitedPermission[feature])
      ? null
      : getQuota(
          feature,
          Number(await redis.get(getKey(user.id, feature, usageResetsAt())))
        ),
  /** Free takes the unit before `run` starts, so parallel calls cannot pass the limit, and gets it back when `run` throws or calls `skipCount`; unlimited is held to the AI budget and credits instead. */
  metered: async <T>(
    context: UsageContext,
    feature: keyof typeof limitReachedMessage,
    run: (skipCount: () => void) => Promise<T>
  ) => {
    const { permissions, user } = context
    let counts = true
    const skipCount = () => {
      counts = false
    }
    if (permissions.check(unlimitedPermission[feature])) {
      if (!(await payForAi(context))) {
        throw new ORPCError('TOO_MANY_REQUESTS', {
          message: AI_BUDGET_SPENT_MESSAGE,
        })
      }
      return run(skipCount)
    }
    const { release, used } = await increment(user.id, feature)
    if (used > FREE_WEEKLY_LIMITS[feature]) {
      await release()
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: limitReachedMessage[feature],
      })
    }
    const result = await run(skipCount).catch(async (error: unknown) => {
      await release()
      throw error
    })
    if (!counts) {
      await release()
    }
    return result
  },
  record: async (
    { permissions, user }: UsageContext,
    feature: MeteredFeature
  ) => {
    if (permissions.check(unlimitedPermission[feature])) {
      return null
    }
    const { used } = await increment(user.id, feature)
    return getQuota(feature, used)
  },
}
