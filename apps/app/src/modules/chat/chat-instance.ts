import { Chat } from '@ai-sdk/react'
import { asyncIteratorToStream } from '@orpc/client'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatOnFinishCallback } from 'ai'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { memoize } from 'memoza'
import { v7 } from 'uuid'

import { orpc } from '~/lib/orpc'

import { chatToolRuns } from './chat-tools'
import { chatModelOptionsValue, chatModelValue } from './stores'

const modelPick = () => {
  const model = chatModelValue.get() ?? undefined
  return { ...(model && chatModelOptionsValue.get()[model]), model }
}

type FinishListener = Parameters<ChatOnFinishCallback<AppUIMessage>>[0]

const finishListeners = new Map<string, (event: FinishListener) => void>()

/** Hears every stream of the chat end, a tool step included; returns the unsubscribe. */
export const onChatFinish = (
  chatId: string,
  listener: (event: FinishListener) => void
) => {
  finishListeners.set(chatId, listener)
  return () => finishListeners.delete(chatId)
}

export const getChatInstance = memoize(
  (data: {
    chatId: string
    connectionResourceId: string
    /** Sent with every turn: only the first creates the chat, as a subagent of `parentChatId`. */
    subagent?: { parentChatId: string; title: string }
  }) => {
    const chat: Chat<AppUIMessage> = new Chat<AppUIMessage>({
      generateId: v7,
      id: data.chatId,
      onFinish: (event) => finishListeners.get(data.chatId)?.(event),
      onToolCall: ({ toolCall }) =>
        chatToolRuns.answer(chat, toolCall, data.connectionResourceId),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      transport: {
        reconnectToStream: async ({ abortSignal }) => {
          const chunks = await orpc.ai.attachStream.call(
            { chatId: data.chatId, ...modelPick() },
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
                subagent: data.subagent,
                ...modelPick(),
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
