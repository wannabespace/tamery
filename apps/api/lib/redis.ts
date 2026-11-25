import { RedisPublisher } from '@orpc/publisher/redis'
import type { MaybePromise } from '@tamery/shared/utils'
import { silently } from '@tamery/shared/utils'
import { createClient } from 'redis'

import { env } from '~/env'

export const redis = createClient({
  socket: env.REDIS_CA ? { ca: env.REDIS_CA, tls: true } : undefined,
  url: env.REDIS_URL,
}).on('error', console.error)
export const redisSubscriber: typeof redis = redis
  .duplicate()
  .on('error', console.error)
await redis.connect()

/**
 * Never rejects: handlers publish without awaiting once their write committed, a dropped Redis connection rejects every
 * publish in flight, and an unhandled rejection exits the process. A subscriber that misses an event catches up on `sync`.
 */
export class BestEffortPublisher<
  T extends Record<string, object>,
> extends RedisPublisher<T> {
  override async publish<K extends keyof T & string>(event: K, payload: T[K]) {
    await silently(() => super.publish(event, payload))
  }
}

export const redisMemoize = async <T>(
  fn: () => MaybePromise<T>,
  key: string,
  ttl: number = 60 * 60 * 24
) => {
  const cached = await redis.get(key)
  if (cached) {
    return JSON.parse(cached) as T
  }

  const data = await fn()
  await redis.setEx(key, ttl, JSON.stringify(data === undefined ? null : data))
  return data
}
