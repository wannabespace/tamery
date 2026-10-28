import { Suspense } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'

import { ChatConversation } from './chat-conversation'
import { ChatSkeleton } from './chat-skeleton'
import { chatTabs } from './chat-tabs'
import { draftChatStore, getChatStore } from './stores'
import { useChatSession } from './use-chat-session'

const AgentChat = ({
  chatId,
  connectionResourceId,
}: {
  chatId: string
  connectionResourceId: string
}) => (
  <ChatConversation
    isActive
    isPage
    onNewChat={() => chatTabs.startNew(connectionResourceId)}
    session={useChatSession({ chatId, connectionResourceId })}
  />
)

/** Agent mode's workspace: the active chat tab, full width under the tab strip. */
export const AgentView = () => {
  const { connectionResource } = useConnectionContext()
  const chatId = useSubscription(getChatStore(connectionResource.id))
  const draftId = useSubscription(draftChatStore(connectionResource.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<ChatSkeleton isPage />}>
        <AgentChat
          key={chatId ?? draftId}
          chatId={chatId ?? draftId}
          connectionResourceId={connectionResource.id}
        />
      </Suspense>
    </div>
  )
}
