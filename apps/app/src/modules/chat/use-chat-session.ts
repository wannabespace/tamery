import { useChat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import {
  mergeMessages,
  messagesFromPartRows,
  textFromMessage,
} from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { eq, useLiveSuspenseQuery } from '@tanstack/react-db'
import type { FileUIPart } from 'ai'
import { isToolUIPart } from 'ai'
import { Result } from 'better-result'
import { useEffect, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'
import { v7 } from 'uuid'

import { agentDatabase } from '~/core/agent/database'
import { useCollections } from '~/core/collections'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { getChatInstance } from './chat-instance'
import { chatToolRuns } from './chat-tools'
import type { PromptMention } from './prompt-mentions'
import { chatQueueStore } from './stores'

const mentionPart = async (
  mention: PromptMention
): Promise<AppUIMessage['parts'][number]> => {
  if (mention.kind === 'connection') {
    return { data: mention.connection, type: 'data-connection' }
  }
  if (mention.kind === 'skill') {
    const { description: _, ...skill } = mention.skill
    return { data: skill, type: 'data-skill' }
  }
  const definition = await Result.tryPromise(() =>
    agentDatabase.describeTable(mention.table)
  )
  return {
    data: { ...mention.table, definition: definition.unwrapOr(null) },
    type: 'data-table',
  }
}

/** A read the window is still answering keeps the turn open; a change or a note waiting on the user does not, nor a read left behind by Stop or a reload, which no one will answer. */
const isAnswering = (
  message: AppUIMessage | undefined,
  live: AppUIMessage[],
  stoppedId: string | undefined
) =>
  message?.role === 'assistant' &&
  message.id === live.at(-1)?.id &&
  message.id !== stoppedId &&
  message.parts.some(
    (part) =>
      isToolUIPart(part) &&
      (part.state === 'input-streaming' ||
        (part.state === 'input-available' &&
          part.type !== 'tool-execute' &&
          part.type !== 'tool-propose_note'))
  )

const pausedBy = ({
  lastMessage,
  status,
  stoppedId,
}: {
  lastMessage: AppUIMessage | undefined
  status: string
  stoppedId: string | undefined
}): 'limit' | 'user' | null => {
  if (status !== 'ready' || !lastMessage) {
    return null
  }
  if (lastMessage.role === 'assistant' && lastMessage.metadata?.capped) {
    return 'limit'
  }
  return lastMessage.id === stoppedId ? 'user' : null
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

  const [stoppedId, setStoppedId] = useState<string>()
  const isWorking =
    isStreaming ||
    isAwaitingAnswer ||
    isAnswering(lastMessage, messages, stoppedId)
  const queueStore = chatQueueStore(chatId)
  const queue = useSubscription(queueStore)

  const halt = async () => {
    chatToolRuns.stop(chatId)
    void orpc.ai.abortStream.call({ chatId })
    await stop()
  }

  const deliver = async (
    text: string,
    mentions: PromptMention[],
    files: FileUIPart[]
  ) => {
    const parts = await Promise.all(mentions.map(mentionPart))
    await sendMessage({
      id: v7(),
      parts: [
        ...(text ? [{ text, type: 'text' as const }] : []),
        ...files,
        ...parts,
      ],
      role: 'user',
    })
  }

  useEffect(() => {
    if (isAwaitingAnswer) {
      void resumeStream()
    }
  }, [isAwaitingAnswer, resumeStream])

  const [next] = queue
  // A table mention is described before the message goes out, and the status only turns busy after, so without this the next render would send a second queued message too.
  const isFlushing = useRef(false)
  useEffect(() => {
    if (!isWorking && next && !isFlushing.current) {
      isFlushing.current = true
      queueStore.set((current) => current.filter(({ id }) => id !== next.id))
      void deliver(next.text, next.mentions, next.files).finally(() => {
        isFlushing.current = false
      })
    }
  })

  return {
    chatHistory: chatHistory.filter((row) => !row.parentChatId),
    chatId,
    compaction: chat?.compaction ?? null,
    decide: {
      judge: ({
        dialect,
        signal,
        statement,
      }: {
        dialect: string
        signal: AbortSignal
        statement: string
      }) =>
        orpc.ai.judgeStatement.call(
          { chatId, dialect, statement },
          { context: { silent: true }, signal }
        ),
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
    /** Asks `messageId` again with new text; everything after it is replaced by the new answer. */
    edit: async (
      messageId: string,
      text: string,
      mentions: PromptMention[]
    ) => {
      const original = displayMessages.find(({ id }) => id === messageId)
      if (!original) {
        return
      }
      posthog.capture('ai_chat_message_edited')
      const parts = [
        { text, type: 'text' as const },
        ...original.parts.filter((part) => part.type !== 'text'),
      ]
      const added = await Promise.all(mentions.map(mentionPart))
      // `sendMessage` finds `messageId` only among live turns, and a chat reopened from the collections holds none.
      if (!instance.messages.some(({ id }) => id === messageId)) {
        instance.messages = displayMessages
      }
      await sendMessage({
        messageId,
        parts: [...parts, ...added],
        role: 'user',
      })
    },
    error,
    /** Why the last answer stopped short and can be continued: its step limit, or the user's own Stop in this window. */
    pausedBy: pausedBy({ lastMessage, status, stoppedId }),
    isReady: status === 'ready',
    isStreaming,
    isWorking,
    messages: displayMessages,
    queue,
    removeQueued: (id: string) =>
      queueStore.set((current) => current.filter((item) => item.id !== id)),
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
    /** While the agent works, a message waits in the queue, unless `now` stops the agent and sends it at once. */
    send: async (
      text: string,
      mentions: PromptMention[],
      files: FileUIPart[] = [],
      now = false
    ) => {
      posthog.capture('ai_chat_message_sent', {
        attachments: files.length,
        interrupted: isWorking && now,
        queued: isWorking && !now,
        connection_mentions: mentions.filter(
          ({ kind }) => kind === 'connection'
        ).length,
        skill_mentions: mentions.filter(({ kind }) => kind === 'skill').length,
        table_mentions: mentions.filter(({ kind }) => kind === 'table').length,
      })
      if (isWorking && !now) {
        queueStore.set((current) => [
          ...current,
          { files, id: v7(), mentions, text },
        ])
        return
      }
      if (isWorking) {
        await halt()
      }
      await deliver(text, mentions, files)
    },
    stop: () => {
      posthog.capture('ai_chat_stopped')
      setStoppedId(lastMessage?.id)
      void halt()
    },
    title: chat?.title || (firstMessage ? textFromMessage(firstMessage) : null),
  }
}

export type ChatSession = ReturnType<typeof useChatSession>
