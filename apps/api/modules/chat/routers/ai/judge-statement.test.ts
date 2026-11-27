import { beforeEach, expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'

const judge = mock(() => Promise.resolve({ approve: true }))
mock.module('@tamery/ai/features', () => ({ judgeStatement: judge }))
mock.module('@tamery/db', () => ({
  db: {
    query: {
      chats: {
        findFirst: () => Promise.resolve({ connectionResourceId: 'resource' }),
      },
    },
  },
}))
let messages: unknown[] = []
mock.module('~/modules/chat/persist', () => ({
  chatPersist: { loadMessages: () => Promise.resolve(messages) },
}))
mock.module('~/modules/chat/session', () => ({
  chatSession: {
    connection: () => Promise.resolve({ id: 'connection', type: 'postgres' }),
  },
}))
mock.module('~/lib/redis', () => ({ redis: {} }))
mock.module('@orpc/ratelimit/redis', () => ({ RedisRateLimiter: mock() }))
const passThrough = os.middleware(({ next }) => next())
mock.module('@orpc/ratelimit', () => ({ ratelimit: () => passThrough }))
const payer = { key: {}, recordJev: () => mock(), telemetry: () => ({}) }
mock.module('~/orpc', () => ({
  aiPermissionsMiddleware: passThrough,
  orpc: os.$context<{ user: { id: string } }>(),
  paidAiMiddleware: os.middleware(({ next }) => next({ context: { payer } })),
  permix: { checkMiddleware: () => passThrough },
}))

const { judgeStatement } = await import('./judge-statement')

const chatId = '0190a000-0000-7000-8000-000000000001'
const transcript = (statement: string, connectionId: string) => [
  {
    id: 'm1',
    parts: [{ text: 'Add an index on users.email', type: 'text' }],
    role: 'user',
  },
  {
    id: 'm2',
    parts: [
      {
        input: { connectionId, statement },
        state: 'input-available',
        toolCallId: 'call-1',
        type: 'tool-execute',
      },
    ],
    role: 'assistant',
  },
]
const judged = () =>
  call(
    judgeStatement,
    { chatId, toolCallId: 'call-1' },
    { context: { user: { id: 'user' } } as never }
  )

beforeEach(() => {
  judge.mockClear()
})

test('the judge reads the stored call and works out its risk on the server', async () => {
  messages = transcript('create index on users (email)', 'connection')

  await judged()

  expect(judge).toHaveBeenCalledTimes(1)
  expect(judge.mock.calls[0]).toMatchObject([
    {
      additive: true,
      dialect: 'postgres',
      request: 'Add an index on users.email',
      statement: 'create index on users (email)',
    },
  ] as never)
})

test('a stored call for another connection is never judged', async () => {
  messages = transcript('drop table users', 'other-connection')

  expect(await judged()).toBeNull()
  expect(judge).not.toHaveBeenCalled()
})

test('a statement longer than the judge reads waits for Run', async () => {
  messages = transcript(
    `select 1;${' '.repeat(4000)}drop table users`,
    'connection'
  )

  expect(await judged()).toBeNull()
  expect(judge).not.toHaveBeenCalled()
})

test('a user message shaped like the call is never judged', async () => {
  messages = transcript('drop table users', 'connection').map((message) => ({
    ...message,
    role: 'user',
  }))

  expect(await judged()).toBeNull()
  expect(judge).not.toHaveBeenCalled()
}, 15_000)
