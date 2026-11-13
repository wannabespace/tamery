import { Activity, Suspense } from 'react'
import { useSubscription } from 'seitu/react'

import { useTabContext } from '~/core/connection/route'
import { useShortcut } from '~/core/keyboard/use-shortcuts'

import { ChatConversation } from './chat-conversation'
import { ChatSkeleton } from './chat-skeleton'
import { startNewChat } from './open-chat'
import { openSubagent, useSubagents } from './subagent-part'
import { SubagentStrip, SubagentView } from './subagent-views'
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
  const newChat = () => startNewChat(connectionResourceId)
  const subagents = useSubagents(chatId, session.messages)
  const openId = useSubscription(openSubagentStore(connectionResourceId))
  const shown = subagents.find((agent) => agent.chatId === openId)
  const views = [null, ...subagents.map((agent) => agent.chatId)]
  const step = (delta: number) => {
    const index = views.indexOf(shown?.chatId ?? null)
    openSubagent(
      connectionResourceId,
      views[(index + delta + views.length) % views.length] ?? null
    )
  }
  const canStep = subagents.length > 0

  useShortcut('nextSubagent', () => step(1), { enabled: canStep })
  useShortcut('previousSubagent', () => step(-1), { enabled: canStep })

  return (
    <>
      {shown && (
        <SubagentView
          agent={shown}
          onBack={() => openSubagent(connectionResourceId, null)}
        />
      )}
      <Activity mode={shown ? 'hidden' : 'visible'}>
        <ChatConversation
          beforeInput={<SubagentStrip subagents={subagents} />}
          isActive={!shown}
          onNewChat={newChat}
          session={session}
        />
      </Activity>
    </>
  )
}

const ChatTabContent = ({ params }: { id: string; params: ChatParams }) => {
  const { connectionResource } = useTabContext()

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
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
