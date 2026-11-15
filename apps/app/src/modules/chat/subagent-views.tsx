import { AiNetworkIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@tamery/ui/components/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { cn } from '@tamery/ui/lib/utils'
import { Suspense, useState } from 'react'

import { useConnectionContext } from '~/core/connection/route'

import { ChatConversation } from './chat-conversation'
import { DOT, openSubagent, STATUS } from './subagent-part'
import type { Subagent } from './subagents-store'
import { useChatSession } from './use-chat-session'

const ACTIVE: [Subagent['status'], string][] = [
  ['running', 'working'],
  ['waiting', 'waiting for you'],
]

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

/** The subagents still at work above the composer, as one menu: gone once none is working or waiting. */
export const SubagentStrip = ({ subagents }: { subagents: Subagent[] }) => {
  const { connectionResource } = useConnectionContext()
  const active = subagents.filter(({ status }) =>
    ACTIVE.some(([state]) => state === status)
  )
  if (active.length === 0) {
    return null
  }
  const summary = ACTIVE.flatMap(([status, label]) => {
    const count = active.filter((agent) => agent.status === status).length
    return count > 0 ? [`${count} ${label}`] : []
  }).join(' · ')

  return (
    <div className="flex items-center px-3 pt-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost-muted" size="xs" />}
        >
          <HugeiconsIcon icon={AiNetworkIcon} strokeWidth={2} />
          Subagents
          <span
            className={cn(
              'text-muted-foreground',
              active.some(({ status }) => status === 'running') && 'shimmer'
            )}
          >
            {summary}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {active.map((agent) => (
            <DropdownMenuItem
              key={agent.chatId}
              onClick={() => openSubagent(connectionResource.id, agent.chatId)}
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  DOT[agent.status]
                )}
              />
              <span data-mask className="truncate">
                {agent.title}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
