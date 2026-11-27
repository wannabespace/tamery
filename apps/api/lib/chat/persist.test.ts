import { expect, mock, test } from 'bun:test'

const call = {
  input: { statement: 'select 1' },
  state: 'input-available',
  toolCallId: 'call-1',
  type: 'tool-execute',
}
const stored = [{ id: 'part-1', order: 0, part: call }]
const updates: unknown[] = []
const tx = {
  update: () => ({
    set: (value: unknown) => {
      updates.push(value)
      return { where: () => ({ returning: () => Promise.resolve([]) }) }
    },
  }),
}
mock.module('@tamery/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => Promise.resolve(stored) }),
      }),
    }),
    transaction: (run: (t: typeof tx) => unknown) => run(tx),
  },
}))
mock.module('@tamery/db/schema', () => ({
  chats: {},
  chatsMessages: {},
  chatsMessagesParts: {},
}))
mock.module('~/lib/chat/attachments', () => ({ attachments: {} }))
mock.module('~/lib/chat/compaction', () => ({ chatCompaction: {} }))
mock.module('~/orpc/routers/chats-messages-parts/events', () => ({
  publisher: { publish: mock() },
}))
mock.module('~/orpc/routers/chats-messages/events', () => ({
  publisher: { publish: mock() },
}))

const { chatPersist } = await import('./persist')

const answer = (part: object) =>
  chatPersist.persistToolOutputs({
    chatId: 'chat',
    message: { id: 'message', parts: [part], role: 'assistant' } as never,
    userId: 'user',
  })

test('a window fills in a tool call output and never its input', async () => {
  const output = { ...call, output: { rows: [] }, state: 'output-available' }

  await answer({ ...output, input: { statement: 'drop table users' } })
  await answer({ ...call, state: 'input-available' })
  expect(updates).toEqual([])

  await answer(output)
  expect(updates).toEqual([{ part: output }])
})
