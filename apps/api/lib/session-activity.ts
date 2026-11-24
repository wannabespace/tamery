import { silently } from '@tamery/shared/utils'
import { type } from 'arktype'

import { redis } from './redis'

const TTL_SECONDS = 60 * 60 * 24 * 30

const activityKey = (sessionId: string) => `session-activity:${sessionId}`

const activityType = type('string.json.parse').to({
  at: 'number',
  ip: 'string | null',
})

/** Better Auth refreshes a session row at most once a day and keeps the IP it was created from, so the row alone can't say when and where a device last called the API. */
export const sessionActivity = {
  read: async (sessionIds: string[]) => {
    if (sessionIds.length === 0) {
      return []
    }
    const values = await redis.mGet(sessionIds.map(activityKey))
    return values.map((value) => {
      const activity = value === null ? null : activityType(value)
      return activity && !(activity instanceof type.errors)
        ? { at: new Date(activity.at), ip: activity.ip }
        : null
    })
  },
  touch: (sessionId: string, ip: string | null) =>
    silently(() =>
      redis.setEx(
        activityKey(sessionId),
        TTL_SECONDS,
        JSON.stringify({ at: Date.now(), ip })
      )
    ),
}
