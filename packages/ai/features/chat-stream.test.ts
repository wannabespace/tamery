import { beforeEach, expect, mock, test } from 'bun:test'
import { setTimeout as sleep } from 'node:timers/promises'

const store = new Map<string, string>()
const client = {
  connect: () => Promise.resolve(),
  del: (key: string) => Promise.resolve(Number(store.delete(key))),
  duplicate: () => client,
  eval: (
    _script: string,
    { arguments: args, keys }: { arguments: string[]; keys: string[] }
  ) => {
    const [key = ''] = keys
    const [expected, next] = args
    if (store.get(key) !== expected) {
      return Promise.resolve(0)
    }
    store.set(key, next ?? '')
    return Promise.resolve(1)
  },
  get: (key: string) => Promise.resolve(store.get(key) ?? null),
  on: () => client,
  set: (key: string, value: string, options?: { NX?: boolean }) => {
    if (options?.NX && store.has(key)) {
      return Promise.resolve(null)
    }
    store.set(key, value)
    return Promise.resolve('OK')
  },
}
mock.module('redis', () => ({ createClient: () => client }))
mock.module('../env', () => ({ env: { REDIS_URL: 'redis://test' } }))

const registered = new Set<string>()
mock.module('ai-resumable-stream/adapters/redis', () => ({
  createRedisAdapter: () => ({}),
}))
mock.module('ai-resumable-stream/ai-sdk', () => ({
  createResumableUIMessageStream: () => ({
    resumeStream: ({ streamId }: { streamId: string }) =>
      Promise.resolve(registered.has(streamId) ? [] : null),
    startStream: async (
      source: ReadableStream,
      { streamId }: { streamId: string }
    ) => {
      await sleep(1)
      registered.add(streamId)
      void source.pipeTo(new WritableStream()).catch(() => null)
      return { stream: source }
    },
    stopStream: () => Promise.resolve(),
  }),
}))

let releaseStep = () => {}
mock.module('./chat-step', () => ({
  streamChatStep: async () => {
    const step = Promise.withResolvers<undefined>()
    releaseStep = () => step.resolve(undefined)
    await step.promise
    return new ReadableStream({ start: (controller) => controller.close() })
  },
}))

const { chatStream } = await import('./chat-stream')

const input = { key: 'tamery', messages: [], onFinish: () => {} } as never

beforeEach(() => {
  store.clear()
  registered.clear()
})

test('an attach while a turn starts streaming never frees the chat for a second producer', async () => {
  const turn = await chatStream.begin('chat')
  const started = turn?.start(input)
  await sleep(20)

  await chatStream.resume('chat')
  const second = await chatStream.begin('chat')

  releaseStep()
  await started
  expect(second).toBeNull()
})

test('a stop during setup keeps the chat claimed until that setup lets it go', async () => {
  const first = await chatStream.begin('chat')
  await chatStream.stop('chat')

  const second = chatStream.begin('chat')
  expect(await first?.stopped()).toBe(true)
  expect(await first?.start(input)).toBeNull()
  await sleep(300)
  expect(store.get('ai:chat-stream:chat')).toStartWith('stopped:')

  await first?.release()
  expect(await second).not.toBeNull()
})
