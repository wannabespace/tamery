import type { ORPCError } from '@orpc/server'
import type { MeteredFeature } from '@tamery/shared/usage'
import { FREE_WEEKLY_LIMITS, usageResetsAt } from '@tamery/shared/usage'

import type { permix } from '~/orpc'

import { redis } from './redis'

const unlimitedPermission = {
  complete: 'ai.query.completeUnlimited',
  filters: 'ai.filter.unlimited',
  mcp: 'mcp.unlimited',
} as const satisfies Record<MeteredFeature, typeof permix.$inferPath>

type UsageContext = ReturnType<typeof permix.setupContext> & {
  user: { id: string }
}

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
  /** Takes the unit before `run` starts, so parallel calls cannot pass the limit, and gives it back when `run` throws or `counts` refuses its result. */
  metered: async <T>(
    { permissions, user }: UsageContext,
    feature: MeteredFeature,
    limitReached: () => ORPCError<string, unknown>,
    run: () => Promise<T>,
    counts: (result: T) => boolean = () => true
  ) => {
    if (permissions.check(unlimitedPermission[feature])) {
      return run()
    }
    const { release, used } = await increment(user.id, feature)
    if (used > FREE_WEEKLY_LIMITS[feature]) {
      await release()
      throw limitReached()
    }
    const result = await run().catch(async (error: unknown) => {
      await release()
      throw error
    })
    if (!counts(result)) {
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
