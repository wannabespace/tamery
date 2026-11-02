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

export const codeChallengeRedis = {
  delete: async (codeChallenge: string) => {
    await redis.del(key(codeChallenge))
  },
  get: async (codeChallenge: string) => {
    const value = await redis.get(key(codeChallenge))
    return value
      ? (JSON.parse(value) as { userId: string; newUser: boolean })
      : null
  },
  set: async (
    codeChallenge: string,
    value: { userId: string; newUser: boolean }
  ) => {
    await redis.setEx(key(codeChallenge), TTL_S, JSON.stringify(value))
  },
}

interface ChallengeDevice {
  ipAddress: string | null
  userAgent: string | null
}

const deviceKey = (codeChallenge: string) =>
  `code-challenge-device:${codeChallenge}`

export const challengeDeviceRedis = {
  delete: async (codeChallenge: string) => {
    await redis.del(deviceKey(codeChallenge))
  },
  get: async (codeChallenge: string) => {
    const value = await redis.get(deviceKey(codeChallenge))
    return value ? (JSON.parse(value) as ChallengeDevice) : null
  },
  register: async (codeChallenge: string, device: ChallengeDevice) => {
    await redis.set(deviceKey(codeChallenge), JSON.stringify(device), {
      condition: 'NX',
      expiration: { type: 'EX', value: TTL_S },
    })
  },
}
