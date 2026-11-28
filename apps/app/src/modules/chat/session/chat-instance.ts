import { Chat } from '@ai-sdk/react'
import { asyncIteratorToStream } from '@orpc/client'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatModelId, ChatModelPick } from '@tamery/ai/models/list'
import type { ChatOnFinishCallback } from 'ai'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { memoize } from 'memoza'
import { v7 } from 'uuid'

import { orpc } from '~/lib/orpc'

import { autoApprove } from '../approval/auto-approval'
import {
  chatModelOptionsValue,
  chatModelValue,
  unreadChatsValue,
} from '../stores'
import { chatToolRuns } from '../tools/chat-tools'

const modelPick = (model: ChatModelPick = chatModelValue.get()) => ({
  ...chatModelOptionsValue.get()[model],
  model,
})

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
    /** The model the parent agent picked for its subagent, used on every turn instead of the user's pick. */
    model?: ChatModelId
    /** Sent with every turn: only the first creates the chat, as a subagent of `parentChatId`. */
    subagent?: { parentChatId: string; title: string }
  }) => {
    const chat: Chat<AppUIMessage> = new Chat<AppUIMessage>({
      generateId: v7,
      id: data.chatId,
      onFinish: (event) => {
        if (!data.subagent && !event.isAbort) {
          unreadChatsValue.set((ids) => [...new Set([...ids, data.chatId])])
        }
        finishListeners.get(data.chatId)?.(event)
      },
      onToolCall: ({ toolCall }) => {
        void chatToolRuns.answer(chat, toolCall, data.connectionResourceId)
        if (!toolCall.dynamic && toolCall.toolName === 'execute') {
          void autoApprove({
            chat,
            connectionResourceId: data.connectionResourceId,
            input: toolCall.input,
            toolCallId: toolCall.toolCallId,
            transcript: chat.messages,
          })
        }
      },
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      transport: {
        reconnectToStream: async ({ abortSignal }) => {
          const chunks = await orpc.ai.attachStream.call(
            { chatId: data.chatId, ...modelPick(data.model) },
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
                ...modelPick(data.model),
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
