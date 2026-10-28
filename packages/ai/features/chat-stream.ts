import type { TelemetryOptions } from 'ai'
import { createRedisAdapter } from 'ai-resumable-stream/adapters/redis'
import { createResumableUIMessageStream } from 'ai-resumable-stream/ai-sdk'
import { createClient } from 'redis'
import { v7 } from 'uuid'

import { env } from '../env'
import type { AgentBudget } from '../limits'
import type { AppUIMessage } from '../message'
import type { ChatConnection } from './chat-step'
import { streamChatStep } from './chat-step'

const redis = createClient({ url: env.REDIS_URL }).on('error', console.error)
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
})

interface ChatStreamInput {
  chatId: string
  connection: ChatConnection
  limits: AgentBudget
  messages: AppUIMessage[]
  onFinish: (message: AppUIMessage) => Promise<void>
  telemetry?: TelemetryOptions
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
        connection: data.connection,
        limits: data.limits,
        messages: data.messages,
        onEnd: data.onFinish,
        onError: (error) => {
          console.error(`chat stream ${streamId} failed`, error)
          return 'Something went wrong while generating the answer.'
        },
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
