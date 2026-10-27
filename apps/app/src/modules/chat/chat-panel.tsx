import { useChat } from '@ai-sdk/react'
import {
  textFromMessage,
  messagesFromPartRows,
  mergeMessages,
} from '@tamery/ai/message'
import { eq, useLiveSuspenseQuery } from '@tanstack/react-db'
import { Suspense, useEffect, useState } from 'react'
import { useSubscription } from 'seitu/react'
import { v7 } from 'uuid'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { resourcePanelClassName } from '~/shell'

import { ChatError } from './chat-error'
import { ChatHeader } from './chat-header'
import { ChatInput } from './chat-input'
import { getChatInstance } from './chat-instance'
import { ChatMessages } from './chat-messages'
import { ChatSkeleton } from './chat-skeleton'
import { chatOpen, getChatStore } from './stores'

const Chat = ({
  chatId,
  connectionResourceId,
  onNewChat,
}: {
  chatId: string
  connectionResourceId: string
  onNewChat: () => void
}) => {
  const chatStore = getChatStore(connectionResourceId)
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
  const collectionMessages = messagesFromPartRows(transcriptRows)

  const {
    error,
    messages,
    regenerate,
    resumeStream,
    sendMessage,
    status,
    stop,
  } = useChat({
    chat: getChatInstance({ chatId, connectionResourceId }),
  })
  const isStreaming = status === 'submitted' || status === 'streaming'
  const displayMessages = mergeMessages(collectionMessages, messages)
  const isAwaitingAnswer =
    !!chat && status === 'ready' && displayMessages.at(-1)?.role === 'user'
  const firstMessage = displayMessages.at(0)
  const pendingTitle = firstMessage ? textFromMessage(firstMessage) : null
  const lastAsked = displayMessages.findLast(
    (message) => message.role === 'user'
  )

  useEffect(() => {
    if (isAwaitingAnswer) {
      void resumeStream()
    }
  }, [isAwaitingAnswer, resumeStream])
  const retry = () => {
    posthog.capture('ai_chat_retried')
    if (messages.length > 0) {
      void regenerate()
      return
    }

    if (lastAsked) {
      void sendMessage(lastAsked)
    }
  }

  return (
    <>
      <ChatHeader
        activeChatId={chatId}
        history={chatHistory}
        title={chat?.title || pendingTitle}
        onClose={() => chatOpen(connectionResourceId).set(false)}
        onNewChat={() => {
          posthog.capture('ai_chat_created')
          onNewChat()
        }}
        onSelectChat={(id) => chatStore.set(id)}
      />
      <ChatMessages isPending={isStreaming} messages={displayMessages} />
      {error && <ChatError error={error} onRetry={retry} />}
      <ChatInput
        isStreaming={isStreaming}
        onSend={(text) => {
          chatStore.set(chatId)
          posthog.capture('ai_chat_message_sent')
          void sendMessage({
            id: v7(),
            parts: [{ text, type: 'text' }],
            role: 'user',
          })
        }}
        onStop={() => {
          posthog.capture('ai_chat_stopped')
          void orpc.ai.abortStream.call({ chatId })
          stop()
        }}
      />
    </>
  )
}

export const ChatPanel = () => {
  const { connectionResource } = useConnectionContext()
  const chatStore = getChatStore(connectionResource.id)
  const chatId = useSubscription(chatStore)
  const [draftId, setDraftId] = useState(() => v7())

  const openBlankChat = () => {
    if (!chatId) {
      return
    }
    setDraftId(v7())
    chatStore.set(null)
  }

  return (
    <div className="flex h-full flex-col pl-1.5">
      <div className={resourcePanelClassName}>
        <Suspense fallback={<ChatSkeleton />}>
          <Chat
            key={chatId ?? draftId}
            chatId={chatId ?? draftId}
            connectionResourceId={connectionResource.id}
            onNewChat={openBlankChat}
          />
        </Suspense>
      </div>
    </div>
  )
}
