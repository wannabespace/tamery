import type { TelemetryOptions } from 'ai'
import { convertToModelMessages, streamText, toUIMessageStream } from 'ai'
import { createRedisAdapter } from 'ai-resumable-stream/adapters/redis'
import { createResumableUIMessageStream } from 'ai-resumable-stream/ai-sdk'
import { createClient } from 'redis'
import { v7 } from 'uuid'

import { env } from '../env'
import type { AppUIMessage } from '../message'
import { models } from '../models/list'

const CHAT_INSTRUCTIONS = [
  'You are Tamery AI, an assistant built into the Tamery database client.',
  'Help the user with their databases: SQL, schema design, data questions, and anything else they ask.',
  'Be concise. Use fenced code blocks with a language tag for SQL and code.',
].join('\n')

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
})

interface ChatStreamInput {
  chatId: string
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

      const result = streamText({
        abortSignal: abortController.signal,
        instructions: CHAT_INSTRUCTIONS,
        messages: await convertToModelMessages(data.messages),
        model: models.chat,
        telemetry: data.telemetry,
      })

      const uiStream = toUIMessageStream({
        generateMessageId: () => v7(),
        onEnd: ({ responseMessage }) => data.onFinish(responseMessage),
        onError: (error) => {
          console.error(`chat stream ${streamId} failed`, error)
          return 'Something went wrong while generating the answer.'
        },
        originalMessages: data.messages,
        stream: result.stream,
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
