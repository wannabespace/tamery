import { beforeEach, expect, mock, test } from 'bun:test'

const release = mock(() => Promise.resolve())
const start = mock(() => Promise.resolve(null))
let claimed = true
let stopped = false
mock.module('@tamery/ai/features', () => ({
  afterCompaction: (history: unknown) => history,
  chatStream: {
    begin: () =>
      Promise.resolve(
        claimed
          ? {
              id: 'turn',
              release,
              start,
              stopped: () => Promise.resolve(stopped),
            }
          : null
      ),
  },
  needsCompaction: () => false,
  pickChatModel: () => Promise.resolve(null),
}))
let streamFree = true
const hold = mock(() => Promise.resolve(streamFree))
const releaseSlot = mock(() => Promise.resolve())
mock.module('~/lib/credits', () => ({
  credits: { hold, release: releaseSlot },
  PAID_CALLS_BUSY_MESSAGE: 'busy',
}))
const markStopped = mock(() => Promise.resolve())
mock.module('~/lib/chat/compaction', () => ({ chatCompaction: {} }))
mock.module('~/lib/chat/persist', () => ({
  chatPersist: {
    loadMessages: () =>
      Promise.resolve([{ id: 'm1', parts: [], role: 'user' }]),
    markStopped,
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
  stopped = false
  markStopped.mockClear()
  streamFree = true
  for (const fn of [release, start, hold, releaseSlot, persistTurn]) {
    fn.mockClear()
  }
})

test('a turn that loses the claim writes and pays for nothing', async () => {
  claimed = false

  expect(await turn()).toBeNull()
  expect(persistTurn).not.toHaveBeenCalled()
  expect(hold).not.toHaveBeenCalled()
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
  expect(hold).not.toHaveBeenCalled()
  expect(persistTurn).toHaveBeenCalledTimes(1)
})

test('a setup that fails gives up the claim and the paid stream', async () => {
  await expect(turn()).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' })
  expect(release).toHaveBeenCalledTimes(1)
  expect(releaseSlot).toHaveBeenCalledWith('user', 'turn')
  expect(start).not.toHaveBeenCalled()
})

test('a stop during setup pays for nothing more and flags only this turn', async () => {
  stopped = true

  expect(await turn()).toBeNull()
  expect(persistTurn).toHaveBeenCalledTimes(1)
  expect(release).toHaveBeenCalledTimes(1)
  expect(releaseSlot).toHaveBeenCalledWith('user', 'turn')
  expect(markStopped).toHaveBeenCalledWith({
    chatId: 'chat',
    messageId: 'm1',
    userId: 'user',
  })
  expect(start).not.toHaveBeenCalled()
})
