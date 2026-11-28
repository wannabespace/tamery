import { expect, mock, test } from 'bun:test'

const findFirst = mock()
mock.module('@tamery/db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
    query: {
      chats: { findFirst },
      connectionsResources: {
        findFirst: () => Promise.resolve({ connection: {}, name: 'fixture' }),
      },
    },
    select: () => ({
      from: () => ({ where: () => Promise.resolve([]) }),
    }),
  },
}))
mock.module('@tamery/db/schema', () => ({
  chats: {},
  schemaNotes: {},
}))
mock.module('~/lib/workspace', () => ({ inMemberWorkspace: () => null }))
mock.module('./routers/chats/events', () => ({ publisher: {} }))

const { chatSession } = await import('./session')

const session = {
  chatId: 'chat',
  connectionResourceId: 'resource',
  userId: 'member',
}

test('a concurrent chat insert requires a matching owner and resource', async () => {
  findFirst.mockResolvedValue(undefined)

  await expect(chatSession.ensureChat(session)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  })
  expect(findFirst).toHaveBeenCalledTimes(2)
  expect(findFirst).toHaveBeenLastCalledWith({
    columns: { parentChatId: true, title: true },
    where: {
      connectionResourceId: { eq: session.connectionResourceId },
      id: { eq: session.chatId },
      userId: { eq: session.userId },
    },
  })
})

test('a concurrent insert for the same chat returns the stored metadata', async () => {
  findFirst
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ parentChatId: 'parent', title: 'Stored title' })

  await expect(chatSession.ensureChat(session)).resolves.toMatchObject({
    isSubagent: true,
    title: 'Stored title',
  })
})
