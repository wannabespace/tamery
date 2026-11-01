import { RedisPublisher } from '@orpc/publisher/redis'

import { redis, redisSubscriber } from '~/lib/redis'

export const codeChallengePublisher = new RedisPublisher<
  Record<string, { ready: boolean }>
>(redis, {
  prefix: 'orpc:publisher:code-challenge:',
  subscriber: redisSubscriber,
})

const TTL_S = 60 * 5

const key = (codeChallenge: string) => `code-challenge:${codeChallenge}`
const requestKey = (codeChallenge: string) =>
  `code-challenge-request:${codeChallenge}`

interface SignInRequest {
  ipAddress: string | null
  userAgent: string | null
}

export const codeChallengeRedis = {
  delete: async (codeChallenge: string) => {
    await redis.del([key(codeChallenge), requestKey(codeChallenge)])
  },
  get: async (codeChallenge: string) => {
    const value = await redis.get(key(codeChallenge))
    return value
      ? (JSON.parse(value) as { userId: string; newUser: boolean })
      : null
  },
  /** The device that started signing in, as its own `listen` saw it; the first to listen keeps it. */
  getRequest: async (codeChallenge: string) => {
    const value = await redis.get(requestKey(codeChallenge))
    return value ? (JSON.parse(value) as SignInRequest) : null
  },
  register: async (codeChallenge: string, request: SignInRequest) => {
    await redis.set(requestKey(codeChallenge), JSON.stringify(request), {
      condition: 'NX',
      expiration: { type: 'EX', value: TTL_S },
    })
  },
  set: async (
    codeChallenge: string,
    value: { userId: string; newUser: boolean }
  ) => {
    await redis.setEx(key(codeChallenge), TTL_S, JSON.stringify(value))
  },
}
