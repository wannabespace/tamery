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

// The pointer holds `setup:<id>` while its turn is written, paid for and prepared, then the stream's id once it streams.
const SETUP = 'setup:'
const SETUP_SECONDS = 300
const STREAM_SECONDS = 3600
const SETUP_WAIT_MS = 30_000
const SETUP_POLL_MS = 250

const PROMOTE = `if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3]) return 1 end return 0`

const activeStream = {
  claim: async (chatId: string, value: string) =>
    !!(await redis.set(activeStream.key(chatId), value, {
      EX: SETUP_SECONDS,
      NX: true,
    })),
  get: (chatId: string) => redis.get(activeStream.key(chatId)),
  key: (chatId: string) => `ai:chat-stream:${chatId}`,
  /** False when a stop took the setup's pointer away. */
  promote: async (chatId: string, streamId: string) =>
    (await redis.eval(PROMOTE, {
      arguments: [SETUP + streamId, streamId, String(STREAM_SECONDS)],
      keys: [activeStream.key(chatId)],
    })) === 1,
  release: async (chatId: string, value: string) => {
    if ((await activeStream.get(chatId)) === value) {
      await redis.del(activeStream.key(chatId))
    }
  },
}

const resumable = createResumableUIMessageStream({
  adapter: createRedisAdapter({ publisher: redis, subscriber }),
  waitUntil: runInBackground,
})

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
  /** Claims the chat's one turn before anything about it is written or paid for; null when another turn holds it. `start` streams the step, or answers null when a stop came during setup; `release` gives the claim up when setup fails. */
  begin: async (chatId: string) => {
    const streamId = v7()
    if (!(await activeStream.claim(chatId, SETUP + streamId))) {
      return null
    }
    return {
      release: () => activeStream.release(chatId, SETUP + streamId),
      start: async (data: ChatStreamInput) => {
        if (!(await activeStream.promote(chatId, streamId))) {
          return null
        }
        try {
          const abortController = new AbortController()
          const uiStream = await streamChatStep({
            ...data,
            abortSignal: abortController.signal,
            limits: CHAT_LIMITS.message,
            onEnd: data.onFinish,
            onError: (error) => {
              logProviderError(`chat stream ${streamId}`, error)
              return 'Something went wrong while generating the answer.'
            },
          })

          const { stream } = await resumable.startStream(uiStream, {
            abortController,
            onFinish: () => activeStream.release(chatId, streamId),
            streamId,
          })
          return stream
        } catch (error) {
          await activeStream.release(chatId, streamId)
          throw error
        }
      },
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
    if (value.startsWith(SETUP)) {
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
    if (!value) {
      return
    }
    await (value.startsWith(SETUP)
      ? activeStream.release(chatId, value)
      : resumable.stopStream({ streamId: value }))
  },
}
