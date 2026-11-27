import '@tamery/shared/arktype-config'
import { beforeEach, expect, mock, test } from 'bun:test'
import process from 'node:process'

import { call, os } from '@orpc/server'
import { machineIdSchema, TAMERY_CLOUD } from '@tamery/shared/machine'

Object.assign(process.env, {
  DATABASE_URL: 'postgres://test@127.0.0.1:1/test',
  ENCRYPTION_SECRET: 'test-encryption-secret-of-32-chars',
  USER_KEY_SECRET: 'test-user-key-secret-of-32-chars',
})

let stored: unknown[] = []
const canRunOn = mock(() => Promise.resolve(true))
const returning = (values: object) => () =>
  Promise.resolve([{ createdAt: new Date(), updatedAt: new Date(), ...values }])

mock.module('@tamery/db', () => ({
  db: {
    insert: () => ({
      values: (values: { machineId: unknown }) => {
        stored.push(values.machineId)
        return {
          onConflictDoUpdate: () => ({ returning: returning(values) }),
        }
      },
    }),
    select: () => ({
      from: () => ({ where: () => Promise.resolve([{ id: 'connection' }]) }),
    }),
    update: () => ({
      set: (values: { machineId: unknown }) => {
        stored.push(values.machineId)
        return { where: () => ({ returning: returning(values) }) }
      },
    }),
  },
}))
mock.module('~/lib/redis', () => ({
  redis: {},
  redisSubscriber: { on: () => {} },
}))
mock.module('~/lib/workspace', () => ({ inMemberWorkspace: () => () => null }))
const passThrough = os.middleware(({ next }) => next())
mock.module('~/orpc', () => ({ authMiddleware: passThrough, orpc: os }))
mock.module('./events', () => ({ publisher: { publish: () => null } }))
mock.module('./machine', () => ({ canRunOn }))

const { create } = await import('./create')
const { update } = await import('./update')

const id = (n: number) => `0190a000-0000-7000-8000-00000000000${n}`
// The middlewares are mocked away, so the handler reads only `user`.
const context = { context: { user: { id: id(9) } } as never }

beforeEach(() => {
  stored = []
  canRunOn.mockClear()
})

test('Tamery Cloud is stored as TAMERY_CLOUD, never checked as a machine', async () => {
  await call(
    create,
    { connectionId: id(2), id: id(1), machineId: TAMERY_CLOUD },
    context
  )
  await call(update, { id: id(1), machineId: TAMERY_CLOUD }, context)

  expect(stored).toEqual([TAMERY_CLOUD, TAMERY_CLOUD])
  expect(canRunOn).not.toHaveBeenCalled()
})

test('no machine is refused', async () => {
  const input = { id: id(1), machineId: null } as never
  await expect(call(update, input, context)).rejects.toThrow()
  expect(stored).toEqual([])
})

test('a machine is checked and stored as itself', async () => {
  const machineId = machineIdSchema.assert(id(3))
  await call(update, { id: id(1), machineId }, context)

  expect(stored).toEqual([id(3)])
  expect(canRunOn).toHaveBeenCalledWith(id(9), id(3))
})
