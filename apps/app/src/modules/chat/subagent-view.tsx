import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@tamery/ui/components/drawer'
import { Suspense, useState } from 'react'

import { useConnectionContext } from '~/core/connection/route'

import { ChatConversation } from './chat-conversation'
import { ACTIVE, STATUS } from './subagent-status'
import type { Subagent } from './subagents-store'
import { useChatSession } from './use-chat-session'

const SubagentChat = ({
  chatId,
  isActive,
  onClose,
}: {
  chatId: string
  /** While it works or waits, the user can write to it; its answer to them still goes to its parent. */
  isActive: boolean
  onClose: () => void
}) => {
  const { connectionResource } = useConnectionContext()
  const session = useChatSession({
    chatId,
    connectionResourceId: connectionResource.id,
  })
  return (
    <ChatConversation
      canInterrupt={false}
      canReply={isActive}
      isActive={false}
      onNewChat={onClose}
      session={session}
    />
  )
}

/** A subagent's own chat in a side drawer over its parent: read, approved, and written to while it works; it reports to the chat that started it. */
export const SubagentDrawer = ({
  agent,
  onClose,
  parentTitle,
}: {
  agent: Subagent | undefined
  onClose: () => void
  parentTitle: string
}) => {
  const [shown, setShown] = useState<{
    agent: Subagent
    opener: Element | null
  }>()
  if (agent && agent.chatId !== shown?.agent.chatId) {
    setShown({ agent, opener: document.activeElement })
  }
  const current = agent ?? shown?.agent

  return (
    <Drawer
      open={!!agent}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => {
        if (!open) {
          if (shown?.opener instanceof HTMLElement) {
            shown.opener.focus()
          }
          setShown(undefined)
        }
      }}
      swipeDirection="right"
      size="sm"
    >
      {current && (
        <DrawerContent className="sm:[--drawer-content-width:42rem]!">
          <DrawerHeader>
            <DrawerTitle data-mask>{current.title}</DrawerTitle>
            <div className="flex items-center gap-1.5 text-xs">
              <DrawerDescription data-mask className="truncate">
                Subagent of {parentTitle}
              </DrawerDescription>
              {STATUS[current.status]}
            </div>
          </DrawerHeader>
          <Suspense fallback={null}>
            <SubagentChat
              chatId={current.chatId}
              isActive={ACTIVE.some(([status]) => status === current.status)}
              onClose={onClose}
            />
          </Suspense>
        </DrawerContent>
      )}
    </Drawer>
  )
}
