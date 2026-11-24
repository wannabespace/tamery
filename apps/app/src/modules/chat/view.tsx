import { title } from '@tamery/shared/title'
import { Suspense, useEffect } from 'react'
import { useSubscription } from 'seitu/react'

import { useTabContext } from '~/core/connection/route'
import { replaceTabId } from '~/core/tabs/actions'
import { tabPath } from '~/core/tabs/ids'
import { history } from '~/lib/last-location'

import { ChatConversation } from './chat-conversation'
import { ChatSkeleton } from './chat-skeleton'
import { adoptStandIn, ComposerStandIn } from './composer-stand-in'
import { startNewChat } from './open-chat'
import { chatDraftsValue, newChatIdsValue, unreadChatsValue } from './stores'
import { SubagentStrip } from './subagent-strip'
import { SubagentDrawer } from './subagent-view'
import { openSubagent, openSubagentStore } from './subagents-store'
import type { ChatParams } from './tab'
import { chatTabId, newChatTabId } from './tab'
import { useChatSession } from './use-chat-session'
import { useSubagents } from './use-subagents'

const TabChat = ({
  chatId,
  connectionResourceId,
  isUnsentTab,
}: {
  chatId: string
  connectionResourceId: string
  isUnsentTab: boolean
}) => {
  const session = useChatSession({ chatId, connectionResourceId })
  const { connection, connectionResource } = useTabContext()
  const hasMessages = session.messages.length > 0
  useEffect(() => {
    if (isUnsentTab && hasMessages) {
      // Rename the tab before navigating: the route adds its tab id as a new tab when it is not listed yet.
      replaceTabId(connectionResourceId, newChatTabId, chatTabId(chatId))
      history.replace(tabPath(connectionResourceId, chatTabId(chatId)))
    }
  }, [isUnsentTab, hasMessages, connectionResourceId, chatId])
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
  const newChatId = useSubscription(newChatIdsValue, {
    selector: (ids) => ids[connectionResource.id],
  })
  const chatId = params.chatId ?? newChatId

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <Suspense
        fallback={
          params.chatId ? (
            <ChatSkeleton />
          ) : (
            <ComposerStandIn
              ref={adoptStandIn(
                (chatId && chatDraftsValue.get()[chatId]?.text) ?? ''
              )}
            />
          )
        }
      >
        {chatId && (
          <TabChat
            chatId={chatId}
            connectionResourceId={connectionResource.id}
            isUnsentTab={!params.chatId}
            key={chatId}
          />
        )}
      </Suspense>
    </div>
  )
}

export const chatView = { Content: ChatTabContent }
