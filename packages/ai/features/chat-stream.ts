import { runInBackground } from '@tamery/shared/background'
import { createRedisAdapter } from 'ai-resumable-stream/adapters/redis'
import { createResumableUIMessageStream } from 'ai-resumable-stream/ai-sdk'
import { createClient } from 'redis'
import { v7 } from 'uuid'

import { env } from '../env'
import { CHAT_LIMITS } from '../limits'
import type { ChatStepInput } from './chat-step'
import { streamChatStep } from './chat-step'

const redis = createClient({
  socket: env.REDIS_CA ? { ca: env.REDIS_CA, tls: true } : undefined,
  url: env.REDIS_URL,
}).on('error', console.error)
const subscriber = redis.duplicate().on('error', console.error)
await redis.connect()

const activeStream = {
  claim: async (chatId: string, streamId: string) =>
    !!(await redis.set(activeStream.key(chatId), streamId, {
      EX: 3600,
      NX: true,
    })),
  get: (chatId: string) => redis.get(activeStream.key(chatId)),
  key: (chatId: string) => `ai:chat-stream:${chatId}`,
  release: async (chatId: string, streamId: string) => {
    if ((await activeStream.get(chatId)) === streamId) {
      await redis.del(activeStream.key(chatId))
    }
  },
}

const resumable = createResumableUIMessageStream({
  adapter: createRedisAdapter({ publisher: redis, subscriber }),
  waitUntil: runInBackground,
})

type ChatStreamInput = Pick<
  ChatStepInput,
  | 'auto'
  | 'connection'
  | 'contextTokens'
  | 'effort'
  | 'fast'
  | 'isSubagent'
  | 'key'
  | 'messages'
  | 'model'
  | 'summary'
  | 'telemetry'
> & {
  chatId: string
  onFinish: ChatStepInput['onEnd']
}

export const chatStream = {
  claim: async (data: ChatStreamInput) => {
    const streamId = v7()
    if (!(await activeStream.claim(data.chatId, streamId))) {
      return null
    }

    try {
      const abortController = new AbortController()
      const uiStream = await streamChatStep({
        abortSignal: abortController.signal,
        auto: data.auto,
        connection: data.connection,
        contextTokens: data.contextTokens,
        effort: data.effort,
        fast: data.fast,
        isSubagent: data.isSubagent,
        key: data.key,
        limits: CHAT_LIMITS.message,
        messages: data.messages,
        model: data.model,
        onEnd: data.onFinish,
        onError: (error) => {
          console.error(`chat stream ${streamId} failed`, error)
          return 'Something went wrong while generating the answer.'
        },
        summary: data.summary,
        telemetry: data.telemetry,
      })

      const { stream } = await resumable.startStream(uiStream, {
        abortController,
        onFinish: () => activeStream.release(data.chatId, streamId),
        streamId,
      })
      return stream
    } catch (error) {
      await activeStream.release(data.chatId, streamId)
      throw error
    }
  },
  resume: async (chatId: string) => {
    const streamId = await activeStream.get(chatId)
    if (!streamId) {
      return null
    }

    const active = await resumable.resumeStream({ streamId }).catch(() => null)
    if (!active) {
      await activeStream.release(chatId, streamId)
    }
    return active
  },
  stop: async (chatId: string) => {
    const streamId = await activeStream.get(chatId)
    if (streamId) {
      await resumable.stopStream({ streamId })
    }
  },
}
