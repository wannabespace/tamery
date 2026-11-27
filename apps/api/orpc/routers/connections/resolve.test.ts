import { expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'

import type { Context } from '../../context'

const SERVER_VERSION = new Date(Date.UTC(2026, 0, 1, 10, 30))
const minutes = (offset: number) =>
  new Date(SERVER_VERSION.getTime() + offset * 60_000)

mock.module('@tamery/db', () => ({
  db: {
    query: {
      connections: {
        findFirst: () =>
          Promise.resolve({
            connectionString: 'encrypted',
            isPasswordExists: true,
            updatedAt: SERVER_VERSION,
            workspaceId: 'workspace',
          }),
      },
    },
  },
}))
mock.module('~/lib/workspace', () => ({ inMemberWorkspace: () => {} }))
const orpc = os.$context<Context>()
mock.module('~/orpc', () => ({
  authMiddleware: orpc.middleware(({ next }) =>
    next({
      context: {
        decryptConnectionString: () => Promise.resolve('postgres://new-host'),
        user: { id: 'user' },
      },
    })
  ),
  orpc,
}))

const { resolve } = await import('./resolve')

const status = async (input: { version?: Date }) => {
  const result = await call(
    resolve,
    { id: '0190a000-0000-7000-8000-000000000001', ...input },
    { context: {} as Context }
  )
  return result.status
}

test.each([
  {
    expected: 'unchanged',
    input: { version: SERVER_VERSION },
    label: 'the version the server holds',
  },
  {
    expected: 'modified',
    input: { version: minutes(5) },
    label: 'a version from a clock that ran ahead',
  },
  {
    expected: 'modified',
    input: { version: minutes(-30) },
    label: 'a version a late replay replaced',
  },
  { expected: 'modified', input: {}, label: 'no version' },
] as const)('$label answers $expected', async ({ expected, input }) => {
  expect(await status(input)).toBe(expected)
})
