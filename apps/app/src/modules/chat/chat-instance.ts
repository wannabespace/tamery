import { Chat } from '@ai-sdk/react'
import { asyncIteratorToStream } from '@orpc/client'
import type { AppUIMessage } from '@tamery/ai/message'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { memoize } from 'memoza'
import { v7 } from 'uuid'

import { orpc } from '~/lib/orpc'

import { chatToolRuns } from './chat-tools'

export const getChatInstance = memoize(
  (data: { chatId: string; connectionResourceId: string }) => {
    const chat: Chat<AppUIMessage> = new Chat<AppUIMessage>({
      generateId: v7,
      id: data.chatId,
      onToolCall: ({ toolCall }) => chatToolRuns.answer(chat, toolCall),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
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
    })
    return chat
  },
  {
    cacheKey: ({ chatId }) => chatId,
  }
)
