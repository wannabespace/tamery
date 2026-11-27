import { beforeEach, expect, mock, test } from 'bun:test'

const release = mock(() => Promise.resolve())
const start = mock(() => Promise.resolve(null))
let claimed = true
mock.module('@tamery/ai/features', () => ({
  afterCompaction: (history: unknown) => history,
  chatStream: {
    begin: () => Promise.resolve(claimed ? { release, start } : null),
  },
  needsCompaction: () => false,
  pickChatModel: () => Promise.resolve(null),
}))
let streamFree = true
const holdStream = mock(() => Promise.resolve(streamFree))
const releaseStream = mock(() => Promise.resolve())
mock.module('~/lib/credits', () => ({
  credits: { holdStream, releaseStream },
}))
mock.module('~/lib/chat/compaction', () => ({ chatCompaction: {} }))
mock.module('~/lib/chat/persist', () => ({
  chatPersist: {
    loadMessages: () => Promise.resolve([{ parts: [], role: 'user' }]),
  },
}))
mock.module('~/lib/chat/suggestion', () => ({ persistChatSuggestion: mock() }))
mock.module('~/lib/chat/title', () => ({ persistChatTitle: mock() }))

const { startChatTurn } = await import('./turn')

const persistTurn = mock(() => Promise.resolve())
const turn = (keys: unknown[] = []) =>
  startChatTurn({
    chat: { isSubagent: false, title: 'Title' } as never,
    chatId: 'chat',
    payer: {
      key: {},
      keys,
      recordJev: () => mock(),
      telemetry: () => ({}),
    } as never,
    persistTurn,
    settings: {},
    userId: 'user',
  })

beforeEach(() => {
  claimed = true
  streamFree = true
  for (const fn of [release, start, holdStream, releaseStream, persistTurn]) {
    fn.mockClear()
  }
})

test('a turn that loses the claim writes and pays for nothing', async () => {
  claimed = false

  expect(await turn()).toBeNull()
  expect(persistTurn).not.toHaveBeenCalled()
  expect(holdStream).not.toHaveBeenCalled()
})

test('a Tamery-paid turn past the streams at once gives the claim back before writing', async () => {
  streamFree = false

  await expect(turn()).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  expect(release).toHaveBeenCalledTimes(1)
  expect(persistTurn).not.toHaveBeenCalled()
})

test('an own-key turn takes no Tamery stream', async () => {
  await expect(turn([{ provider: 'openrouter' }])).rejects.toMatchObject({
    code: 'MODEL_UNAVAILABLE',
  })
  expect(holdStream).not.toHaveBeenCalled()
  expect(persistTurn).toHaveBeenCalledTimes(1)
})

test('a setup that fails gives up the claim and the paid stream', async () => {
  await expect(turn()).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' })
  expect(release).toHaveBeenCalledTimes(1)
  expect(releaseStream).toHaveBeenCalledWith('user', 'chat')
  expect(start).not.toHaveBeenCalled()
})
