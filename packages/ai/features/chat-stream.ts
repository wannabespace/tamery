import { setTimeout as sleep } from 'node:timers/promises'

import { runInBackground } from '@tamery/shared/background'
import { createRedisAdapter } from 'ai-resumable-stream/adapters/redis'
import { createResumableUIMessageStream } from 'ai-resumable-stream/ai-sdk'
import { createClient } from 'redis'
import { v7 } from 'uuid'

import { env } from '../env'
import { CHAT_LIMITS } from '../limits'
import { logProviderError } from '../provider-error'
import type { ChatStepInput } from './chat-step'
import { streamChatStep } from './chat-step'

const redis = createClient({
  socket: env.REDIS_CA ? { ca: env.REDIS_CA, tls: true } : undefined,
  url: env.REDIS_URL,
}).on('error', console.error)
const subscriber = redis.duplicate().on('error', console.error)
await redis.connect()

// The pointer holds `setup:<id>` while its turn is written, paid for and prepared, `stopped:<id>` once a stop came during that setup, then the stream's id once it streams.
const SETUP = 'setup:'
const STOPPED = 'stopped:'
const SETUP_SECONDS = 300
const STREAM_SECONDS = 3600
const SETUP_WAIT_MS = 30_000
const SETUP_POLL_MS = 250

const SWAP = `if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3]) return 1 end return 0`

const activeStream = {
  claim: async (chatId: string, value: string) =>
    !!(await redis.set(activeStream.key(chatId), value, {
      EX: SETUP_SECONDS,
      NX: true,
    })),
  get: (chatId: string) => redis.get(activeStream.key(chatId)),
  key: (chatId: string) => `ai:chat-stream:${chatId}`,
  release: async (chatId: string, value: string) => {
    if ((await activeStream.get(chatId)) === value) {
      await redis.del(activeStream.key(chatId))
    }
  },
  swap: async (chatId: string, from: string, to: string, seconds: number) =>
    (await redis.eval(SWAP, {
      arguments: [from, to, String(seconds)],
      keys: [activeStream.key(chatId)],
    })) === 1,
}

const isPreparing = (value: string) =>
  value.startsWith(SETUP) || value.startsWith(STOPPED)

/** Claims the chat, waiting out a turn whose setup a stop ended but that has not released it yet. */
const claimChat = async (
  chatId: string,
  value: string,
  waitUntil = Date.now() + SETUP_WAIT_MS
): Promise<boolean> => {
  if (await activeStream.claim(chatId, value)) {
    return true
  }
  const current = await activeStream.get(chatId)
  if (!current?.startsWith(STOPPED) || Date.now() > waitUntil) {
    return false
  }
  await sleep(SETUP_POLL_MS)
  return claimChat(chatId, value, waitUntil)
}

const resumable = createResumableUIMessageStream({
  adapter: createRedisAdapter({ publisher: redis, subscriber }),
  waitUntil: runInBackground,
})

type StepChunk =
  Awaited<ReturnType<typeof streamChatStep>> extends ReadableStream<infer C>
    ? C
    : never

type ChatStreamInput = Omit<
  ChatStepInput,
  'abortSignal' | 'limits' | 'onEnd' | 'onError'
> & { onFinish: ChatStepInput['onEnd'] }

const TOOL_CALL_CLAIM_SECONDS = 3600

export const chatStream = {
  /** The first window to claim a tool call answers or decides it; the others watch its output arrive. Claiming again from the same window keeps it. */
  claimToolCall: async (data: {
    chatId: string
    toolCallId: string
    windowId: string
  }) => {
    const key = `ai:tool-call:${data.chatId}:${data.toolCallId}`
    const claimed = await redis.set(key, data.windowId, {
      EX: TOOL_CALL_CLAIM_SECONDS,
      NX: true,
    })
    return !!claimed || (await redis.get(key)) === data.windowId
  },
  /** Claims the chat's one turn before anything about it is written or paid for; null when another turn holds it. `stopped` says a stop came during setup, `start` streams the step or answers null after such a stop, and `release` gives the claim up when setup ends without streaming. */
  begin: async (chatId: string) => {
    const id = v7()
    if (!(await claimChat(chatId, SETUP + id))) {
      return null
    }
    return {
      id,
      release: async () => {
        await activeStream.release(chatId, SETUP + id)
        await activeStream.release(chatId, STOPPED + id)
      },
      start: async (data: ChatStreamInput) => {
        const abortController = new AbortController()
        const { readable, writable } = new TransformStream<StepChunk>()
        // The stream registers before the pointer names it: an attach that reads the id must find it.
        const { stream } = await resumable.startStream(readable, {
          abortController,
          onFinish: () => activeStream.release(chatId, id),
          streamId: id,
        })
        if (
          !(await activeStream.swap(chatId, SETUP + id, id, STREAM_SECONDS))
        ) {
          await writable.close()
          return null
        }
        try {
          const uiStream = await streamChatStep({
            ...data,
            abortSignal: abortController.signal,
            limits: CHAT_LIMITS.message,
            onEnd: data.onFinish,
            onError: (error) => {
              logProviderError(`chat stream ${id}`, error)
              return 'Something went wrong while generating the answer.'
            },
          })
          runInBackground(uiStream.pipeTo(writable).catch(() => null))
          return stream
        } catch (error) {
          await writable.abort(error)
          await activeStream.release(chatId, id)
          throw error
        }
      },
      stopped: async () => (await activeStream.get(chatId)) === STOPPED + id,
    }
  },
  /** The chat's live stream, waiting out a turn still in setup; null when none streams. */
  resume: async (
    chatId: string,
    waitUntil = Date.now() + SETUP_WAIT_MS
  ): Promise<Awaited<ReturnType<typeof resumable.resumeStream>> | null> => {
    const value = await activeStream.get(chatId)
    if (!value) {
      return null
    }
    if (isPreparing(value)) {
      if (Date.now() > waitUntil) {
        return null
      }
      await sleep(SETUP_POLL_MS)
      return chatStream.resume(chatId, waitUntil)
    }

    const active = await resumable
      .resumeStream({ streamId: value })
      .catch(() => null)
    if (!active) {
      await activeStream.release(chatId, value)
    }
    return active
  },
  stop: async (chatId: string) => {
    const value = await activeStream.get(chatId)
    if (!value || value.startsWith(STOPPED)) {
      return
    }
    await (value.startsWith(SETUP)
      ? activeStream.swap(
          chatId,
          value,
          STOPPED + value.slice(SETUP.length),
          SETUP_SECONDS
        )
      : resumable.stopStream({ streamId: value }))
  },
}
