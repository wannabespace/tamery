import { Chat } from '@ai-sdk/react'
import { asyncIteratorToStream } from '@orpc/client'
import type { AppUIMessage } from '@tamery/ai/message'
import { memoize } from 'memoza'
import { v7 } from 'uuid'

import { orpc } from '~/lib/orpc'

export const getChatInstance = memoize(
  (data: { chatId: string; connectionResourceId: string }) =>
    new Chat<AppUIMessage>({
      generateId: v7,
      id: data.chatId,
      transport: {
        reconnectToStream: async ({ abortSignal }) => {
          const chunks = await orpc.ai.attachStream.call(
            { chatId: data.chatId },
            { context: { silent: true }, signal: abortSignal }
          )
          const first = await chunks.next()
          if (first.done) {
            return null
          }
          return asyncIteratorToStream(
            (async function* reconnectToStream() {
              yield first.value
              yield* chunks
            })()
          )
        },
        sendMessages: async ({ abortSignal, messages }) =>
          asyncIteratorToStream(
            await orpc.ai.stream.call(
              {
                chatId: data.chatId,
                connectionResourceId: data.connectionResourceId,
                messages: messages.slice(-1),
              },
              { context: { silent: true }, signal: abortSignal }
            )
          ),
      },
    }),
  {
    cacheKey: ({ chatId }) => chatId,
  }
)
