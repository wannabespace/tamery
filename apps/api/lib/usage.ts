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

export const usage = {
  get: async ({ permissions, user }: UsageContext, feature: MeteredFeature) =>
    permissions.check(unlimitedPermission[feature])
      ? null
      : getQuota(
          feature,
          Number(await redis.get(getKey(user.id, feature, usageResetsAt())))
        ),
  record: async (
    { permissions, user }: UsageContext,
    feature: MeteredFeature
  ) => {
    if (permissions.check(unlimitedPermission[feature])) {
      return null
    }
    const resetsAt = usageResetsAt()
    const key = getKey(user.id, feature, resetsAt)
    const [used] = await redis
      .multi()
      .incr(key)
      .expireAt(key, new Date(resetsAt))
      .exec()
    return getQuota(feature, Number(used))
  },
}
