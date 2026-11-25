import { useChat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import {
  mergeMessages,
  messagesFromPartRows,
  textFromMessage,
} from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { omit } from '@tamery/shared/utils'
import { eq, useLiveSuspenseQuery } from '@tanstack/react-db'
import type { FileUIPart } from 'ai'
import { isToolUIPart, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useEffect, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'
import { v7 } from 'uuid'

import { useCollections } from '~/core/collections'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { autoApprove } from './auto-approval'
import { getChatInstance } from './chat-instance'
import { awaitsUser } from './chat-tool-types'
import { chatToolRuns } from './chat-tools'
import type { PromptMention } from './prompt-mentions'
import { mentionPart, messageParts } from './prompt-mentions'
import { runSql, sqlOf } from './sql-run'
import type { QueuedMessage } from './stores'
import { chatQueueStore } from './stores'

/** A read the window is still answering keeps the turn open; a change waiting on the user does not, nor a read left behind by Stop or a reload, which no one will answer. */
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
        (part.state === 'input-available' && !awaitsUser(part)))
  )

const awaitsAnswer = (message: AppUIMessage | undefined) =>
  message?.role === 'user'

const pausedBy = ({
  lastAsked,
  lastMessage,
  status,
  stoppedId,
}: {
  lastAsked: AppUIMessage | undefined
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
  return lastMessage.id === stoppedId || lastAsked?.metadata?.stopped
    ? 'user'
    : null
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
  const transcript = mergeMessages(
    messagesFromPartRows(transcriptRows),
    messages
  )
  // An edited message replaces what followed it, but the synced rows go only once the server re-asks it.
  const [replacedIds, setReplacedIds] = useState<string[]>([])
  if (
    replacedIds.length > 0 &&
    !transcript.some(({ id }) => replacedIds.includes(id))
  ) {
    setReplacedIds([])
  }
  const displayMessages = transcript.filter(
    ({ id }) => !replacedIds.includes(id)
  )
  const lastMessage = displayMessages.at(-1)
  const isAwaitingAnswer =
    !!chat && status === 'ready' && awaitsAnswer(lastMessage)
  const firstMessage = displayMessages.at(0)
  const lastAsked = displayMessages.findLast(
    (message) => message.role === 'user'
  )

  const [stoppedId, setStoppedId] = useState<string>()
  // Between the window answering a step's tool calls and the SDK sending them back, nothing streams: without this the queue would send into the middle of the turn.
  const isContinuing =
    lastMessage?.id !== stoppedId &&
    lastAssistantMessageIsCompleteWithToolCalls({ messages })
  const isWorking =
    isStreaming ||
    isAwaitingAnswer ||
    isContinuing ||
    isAnswering(lastMessage, messages, stoppedId)
  // A queued message would answer for the user and skip what the agent waits on, a change or a question they have not seen yet.
  const isWaitingOnUser =
    lastMessage?.role === 'assistant' &&
    lastMessage.id !== stoppedId &&
    lastMessage.parts.some(awaitsUser)
  const queueStore = chatQueueStore(chatId)
  const queue = useSubscription(queueStore)

  const halt = async () => {
    chatToolRuns.stop(chatId)
    void orpc.ai.abortStream.call({ chatId })
    await stop()
  }

  const deliver = async ({
    files,
    mentions,
    skipped,
    text,
  }: Omit<QueuedMessage, 'id'>) => {
    const statement = sqlOf(text)
    await sendMessage({
      id: v7(),
      parts: statement
        ? [
            await runSql({
              connectionResourceId,
              signal: chatToolRuns.signal(chatId),
              skipped,
              statement,
            }),
          ]
        : await messageParts(text, mentions, files),
      role: 'user',
    })
  }

  const enqueue = (message: Omit<QueuedMessage, 'id'>) =>
    queueStore.set((current) => [...current, { ...message, id: v7() }])

  useEffect(() => {
    if (isAwaitingAnswer) {
      void resumeStream()
    }
  }, [isAwaitingAnswer, resumeStream])

  const [next] = queue
  // A table mention is described before the message goes out, and the status only turns busy after, so without this the next render would send a second queued message too.
  const isFlushing = useRef(false)
  useEffect(() => {
    if (!(isWorking || isWaitingOnUser) && next && !isFlushing.current) {
      isFlushing.current = true
      queueStore.set((current) => current.filter(({ id }) => id !== next.id))
      void deliver(next).finally(() => {
        isFlushing.current = false
      })
    }
  })

  return {
    chatHistory: chatHistory.filter((row) => !row.parentChatId),
    chatId,
    compaction: chat?.compaction ?? null,
    decide: {
      answer: (data: {
        output: ChatTools['ask_user']['output']
        toolCallId: string
      }) =>
        chatToolRuns.reply({
          ...data,
          chat: instance,
          transcript: displayMessages,
        }),
      auto: (data: {
        input: ChatTools['execute']['input']
        toolCallId: string
      }) =>
        autoApprove({
          ...data,
          chat: instance,
          connectionResourceId,
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
          connectionResourceId,
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
      const index = displayMessages.findIndex(({ id }) => id === messageId)
      const original = displayMessages[index]
      if (!original) {
        return
      }
      posthog.capture('ai_chat_message_edited')
      setReplacedIds(displayMessages.slice(index + 1).map(({ id }) => id))
      const kept = original.parts.filter((part) => part.type !== 'text')
      const parts = [{ text, type: 'text' as const }, ...kept]
      // Describing a table queries the database, so only a mention the original lacks is described.
      const fresh = mentions.filter(
        (mention) =>
          !kept.some((part) => {
            switch (mention.kind) {
              case 'chat': {
                return (
                  part.type === 'data-chat' &&
                  part.data.chatId === mention.chat.chatId
                )
              }
              case 'connection': {
                return (
                  part.type === 'data-connection' &&
                  part.data.connectionId === mention.connection.connectionId &&
                  part.data.resource === mention.connection.resource
                )
              }
              case 'skill': {
                return (
                  part.type === 'data-skill' &&
                  part.data.name === mention.skill.name
                )
              }
              case 'table': {
                return (
                  part.type === 'data-table' &&
                  part.data.connectionId === mention.table.connectionId &&
                  part.data.schema === mention.table.schema &&
                  part.data.table === mention.table.table
                )
              }
              default: {
                return mention satisfies never
              }
            }
          })
      )
      const added = await Promise.all(fresh.map(mentionPart))
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
    /** Why the last answer stopped short and can be continued: its step limit, or the user's Stop. */
    pausedBy: pausedBy({ lastAsked, lastMessage, status, stoppedId }),
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
        // The live copy wins over the synced one, so a kept stop would pause the new answer too.
        void sendMessage({
          ...lastAsked,
          metadata: omit(lastAsked.metadata ?? {}, ['stopped']),
        })
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
        sql: !!sqlOf(text),
        chat_mentions: mentions.filter(({ kind }) => kind === 'chat').length,
        interrupted: isWorking && now,
        queued: isWorking && !now,
        connection_mentions: mentions.filter(
          ({ kind }) => kind === 'connection'
        ).length,
        skill_mentions: mentions.filter(({ kind }) => kind === 'skill').length,
        table_mentions: mentions.filter(({ kind }) => kind === 'table').length,
      })
      if (isWorking && !now) {
        enqueue({ files, mentions, text })
        return
      }
      if (isWorking) {
        await halt()
      }
      await deliver({ files, mentions, text })
    },
    /** Runs a change Auto skipped as the user's own statement, after the turn if the agent still works. */
    runSkipped: (
      { statement, ...target }: ChatTools['execute']['input'],
      toolCallId: string
    ) => {
      const message = {
        files: [],
        mentions: [],
        skipped: { target, toolCallId },
        text: `!${statement}`,
      }
      if (isWorking || isWaitingOnUser) {
        enqueue(message)
        return
      }
      void deliver(message)
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
