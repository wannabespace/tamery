import { beforeEach, expect, mock, test } from 'bun:test'
import { setTimeout as nextTick } from 'node:timers/promises'

import { FREE_WEEKLY_LIMITS } from '@tamery/shared/usage'

const counters = new Map<string, number>()
const add = async (key: string, by: number) => {
  await nextTick()
  const value = (counters.get(key) ?? 0) + by
  counters.set(key, value)
  return value
}

mock.module('./redis', () => ({
  redis: {
    decr: (key: string) => add(key, -1),
    get: (key: string) => Promise.resolve(counters.get(key) ?? null),
    multi: () => {
      let incremented = ''
      const chain = {
        exec: async () => [await add(incremented, 1)],
        expireAt: () => chain,
        incr: (key: string) => {
          incremented = key
          return chain
        },
      }
      return chain
    },
  },
}))

const { usage } = await import('./usage')

const context = {
  permissions: { check: () => false },
  user: { id: 'user-1' },
} as unknown as Parameters<typeof usage.get>[0]
const feature = 'filters'
const max = FREE_WEEKLY_LIMITS[feature]
const used = async () => {
  const quota = await usage.get(context, feature)
  return quota?.used
}

const fillTo = (count: number) =>
  Promise.all(
    Array.from({ length: count }, () => usage.record(context, feature))
  )

beforeEach(() => counters.clear())

test('parallel calls at the limit run only the one unit left', async () => {
  await fillTo(max - 1)
  const run = mock(async () => {
    await nextTick()
    return 'done'
  })

  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => usage.metered(context, feature, run))
  )

  expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
  expect(
    results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason.code] : []
    )
  ).toEqual(Array.from({ length: 4 }, () => 'TOO_MANY_REQUESTS'))
  expect(run).toHaveBeenCalledTimes(1)
  expect(await used()).toBe(max)
})

test('a call that fails or skips its count gives its unit back', async () => {
  await fillTo(max - 1)

  await expect(
    usage.metered(context, feature, () =>
      Promise.reject(new Error('provider failed'))
    )
  ).rejects.toThrow('provider failed')
  await usage.metered(context, feature, (skipCount) => {
    skipCount()
    return Promise.resolve([])
  })
  expect(await used()).toBe(max - 1)

  await usage.metered(context, feature, () => Promise.resolve('done'))
  expect(await used()).toBe(max)
})
