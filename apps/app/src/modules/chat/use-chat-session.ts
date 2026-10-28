import { useChat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import {
  mergeMessages,
  messagesFromPartRows,
  textFromMessage,
} from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { eq, useLiveSuspenseQuery } from '@tanstack/react-db'
import { Result } from 'better-result'
import { useEffect } from 'react'
import { v7 } from 'uuid'

import { agentDatabase } from '~/core/agent/database'
import { useCollections } from '~/core/collections'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { getChatInstance } from './chat-instance'
import { chatTabs } from './chat-tabs'
import { chatToolRuns } from './chat-tools'
import type { PromptMention } from './prompt-mentions'

const mentionPart = async (
  mention: PromptMention
): Promise<AppUIMessage['parts'][number]> => {
  if (mention.kind === 'connection') {
    return { data: mention.connection, type: 'data-connection' }
  }
  const definition = await Result.tryPromise(() =>
    agentDatabase.describeTable(mention.table)
  )
  return {
    data: { ...mention.table, definition: definition.unwrapOr(null) },
    type: 'data-table',
  }
}

export const useChatSession = ({
  chatId,
  connectionResourceId,
}: {
  chatId: string
  connectionResourceId: string
}) => {
  const {
    chatsCollection,
    chatsMessagesCollection,
    chatsMessagesPartsCollection,
  } = useCollections()
  const { data: chatHistory } = useLiveSuspenseQuery({
    query: (q) =>
      q
        .from({ chats: chatsCollection })
        .where(({ chats }) =>
          eq(chats.connectionResourceId, connectionResourceId)
        )
        .orderBy(({ chats }) => chats.createdAt, 'desc'),
  })
  const { data: transcriptRows } = useLiveSuspenseQuery({
    query: (q) =>
      q
        .from({ messages: chatsMessagesCollection })
        .innerJoin(
          { parts: chatsMessagesPartsCollection },
          ({ messages, parts }) => eq(parts.messageId, messages.id)
        )
        .where(({ messages }) => eq(messages.chatId, chatId))
        .orderBy(({ messages }) => messages.createdAt, 'asc')
        .select(({ messages, parts }) => ({
          messageId: messages.id,
          metadata: messages.metadata,
          order: parts.order,
          part: parts.part,
          role: messages.role,
        })),
  })

  const chat = chatHistory.find((row) => row.id === chatId)
  const instance = getChatInstance({ chatId, connectionResourceId })
  const {
    error,
    messages,
    regenerate,
    resumeStream,
    sendMessage,
    status,
    stop,
  } = useChat({ chat: instance })
  const isStreaming = status === 'submitted' || status === 'streaming'
  const displayMessages = mergeMessages(
    messagesFromPartRows(transcriptRows),
    messages
  )
  const lastMessage = displayMessages.at(-1)
  const isAwaitingAnswer =
    !!chat && status === 'ready' && lastMessage?.role === 'user'
  const firstMessage = displayMessages.at(0)
  const lastAsked = displayMessages.findLast(
    (message) => message.role === 'user'
  )

  useEffect(() => {
    if (isAwaitingAnswer) {
      void resumeStream()
    }
  }, [isAwaitingAnswer, resumeStream])

  return {
    chatHistory,
    decide: {
      note: ({
        kept,
        toolCallId,
      }: {
        kept: string | null
        toolCallId: string
      }) =>
        chatToolRuns.note({
          chat: instance,
          kept,
          toolCallId,
          transcript: displayMessages,
        }),
      write: ({
        approved,
        input,
        toolCallId,
      }: {
        approved: boolean
        input: ChatTools['execute']['input']
        toolCallId: string
      }) =>
        chatToolRuns.write({
          approved,
          chat: instance,
          input,
          toolCallId,
          transcript: displayMessages,
        }),
    },
    error,
    isPaused:
      status === 'ready' &&
      lastMessage?.role === 'assistant' &&
      !!lastMessage.metadata?.capped,
    isReady: status === 'ready',
    isStreaming,
    messages: displayMessages,
    resume: () => {
      posthog.capture('ai_chat_continued')
      void sendMessage({
        id: v7(),
        parts: [{ text: 'Continue', type: 'text' }],
        role: 'user',
      })
    },
    retry: () => {
      posthog.capture('ai_chat_retried')
      if (messages.length > 0) {
        void regenerate()
        return
      }
      if (lastAsked) {
        void sendMessage(lastAsked)
      }
    },
    send: async (text: string, mentions: PromptMention[]) => {
      chatTabs.open(connectionResourceId, chatId)
      posthog.capture('ai_chat_message_sent', {
        connection_mentions: mentions.filter(
          ({ kind }) => kind === 'connection'
        ).length,
        table_mentions: mentions.filter(({ kind }) => kind === 'table').length,
      })
      const parts = await Promise.all(mentions.map(mentionPart))
      await sendMessage({
        id: v7(),
        parts: [{ text, type: 'text' }, ...parts],
        role: 'user',
      })
    },
    stop: () => {
      posthog.capture('ai_chat_stopped')
      chatToolRuns.stop(chatId)
      void orpc.ai.abortStream.call({ chatId })
      void stop()
    },
    title: chat?.title || (firstMessage ? textFromMessage(firstMessage) : null),
  }
}

export type ChatSession = ReturnType<typeof useChatSession>
