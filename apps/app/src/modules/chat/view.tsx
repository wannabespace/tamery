import { title } from '@tamery/shared/title'
import { Suspense, useEffect } from 'react'
import { useSubscription } from 'seitu/react'

import { useTabContext } from '~/core/connection/route'

import { ChatConversation } from './chat-conversation'
import { ChatSkeleton } from './chat-skeleton'
import { startNewChat } from './open-chat'
import { unreadChatsValue } from './stores'
import { openSubagent, useSubagents } from './subagent-part'
import { SubagentDrawer, SubagentStrip } from './subagent-views'
import { openSubagentStore } from './subagents-store'
import type { ChatParams } from './tab'
import { useChatSession } from './use-chat-session'

const TabChat = ({
  chatId,
  connectionResourceId,
}: {
  chatId: string
  connectionResourceId: string
}) => {
  const session = useChatSession({ chatId, connectionResourceId })
  const { connection, connectionResource } = useTabContext()
  // The route's head is computed before the chats sync in and never hears a new title, so the open chat names the window itself.
  useEffect(() => {
    document.title = title(
      session.title ?? 'New chat',
      connection.name,
      connectionResource.name
    )
  }, [session.title, connection.name, connectionResource.name])
  const isUnread = useSubscription(unreadChatsValue, {
    selector: (ids) => ids.includes(chatId),
  })
  useEffect(() => {
    if (isUnread) {
      unreadChatsValue.set((ids) => ids.filter((id) => id !== chatId))
    }
  }, [isUnread, chatId])
  const newChat = () => startNewChat(connectionResourceId)
  const subagents = useSubagents(chatId, session.messages)
  const openId = useSubscription(openSubagentStore(connectionResourceId))

  return (
    <>
      <ChatConversation
        beforeInput={<SubagentStrip subagents={subagents} />}
        isActive={!openId}
        onNewChat={newChat}
        session={session}
      />
      <SubagentDrawer
        agent={subagents.find((agent) => agent.chatId === openId)}
        onClose={() => openSubagent(connectionResourceId, null)}
        parentTitle={session.title ?? 'New chat'}
      />
    </>
  )
}

const ChatTabContent = ({ params }: { id: string; params: ChatParams }) => {
  const { connectionResource } = useTabContext()

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <Suspense fallback={<ChatSkeleton />}>
        <TabChat
          chatId={params.chatId}
          connectionResourceId={connectionResource.id}
        />
      </Suspense>
    </div>
  )
}

export const chatView = { Content: ChatTabContent }
