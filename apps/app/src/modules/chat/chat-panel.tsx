import { Suspense } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { resourcePanelClassName } from '~/shell'

import { ChatConversation } from './chat-conversation'
import { ChatHeader } from './chat-header'
import { ChatSkeleton } from './chat-skeleton'
import { chatTabs } from './chat-tabs'
import { chatOpen, draftChatStore, getChatStore } from './stores'
import { useChatSession } from './use-chat-session'

const PanelChat = ({
  chatId,
  connectionResourceId,
}: {
  chatId: string
  connectionResourceId: string
}) => {
  const session = useChatSession({ chatId, connectionResourceId })
  const isOpened = useSubscription(chatOpen(connectionResourceId))
  const newChat = () => chatTabs.startNew(connectionResourceId)

  return (
    <>
      <ChatHeader
        activeChatId={chatId}
        history={session.chatHistory}
        title={session.title}
        onClose={() => chatOpen(connectionResourceId).set(false)}
        onNewChat={newChat}
        onSelectChat={(id) => chatTabs.open(connectionResourceId, id)}
      />
      <ChatConversation
        isActive={isOpened}
        onNewChat={newChat}
        session={session}
      />
    </>
  )
}

export const ChatPanel = () => {
  const { connectionResource } = useConnectionContext()
  const chatId = useSubscription(getChatStore(connectionResource.id))
  const draftId = useSubscription(draftChatStore(connectionResource.id))

  return (
    <div className="flex h-full flex-col pl-1.5">
      <div className={resourcePanelClassName}>
        <Suspense fallback={<ChatSkeleton />}>
          <PanelChat
            key={chatId ?? draftId}
            chatId={chatId ?? draftId}
            connectionResourceId={connectionResource.id}
          />
        </Suspense>
      </div>
    </div>
  )
}
