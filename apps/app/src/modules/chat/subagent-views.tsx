import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { Kbd } from '@tamery/ui/components/kbd'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useEffect, useRef } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'

import { ChatConversation } from './chat-conversation'
import { DOT, openSubagent, STATUS } from './subagent-part'
import type { Subagent } from './subagents-store'
import { useChatSession } from './use-chat-session'

const headerClassName =
  'flex h-8 shrink-0 items-center gap-0.5 border-b pr-1 pl-3'

/** Every subagent of the chat above its composer: one Tab stop, ←/→ to move, Enter to open. */
export const SubagentStrip = ({ subagents }: { subagents: Subagent[] }) => {
  const { connectionResource } = useConnectionContext()
  if (subagents.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2 px-3 pt-1">
      <span className="text-muted-foreground shrink-0 text-xs">Subagents</span>
      <Tabs
        value={null}
        onValueChange={(chatId: string) =>
          openSubagent(connectionResource.id, chatId)
        }
        className="min-w-0"
      >
        <TabsList variant="line" className="no-scrollbar overflow-x-auto">
          {subagents.map((agent) => (
            <TabsTrigger key={agent.chatId} value={agent.chatId}>
              <span
                className={cn('size-1.5 rounded-full', DOT[agent.status])}
              />
              <span className="max-w-40 truncate">{agent.title}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <span className="text-muted-foreground ml-auto shrink-0 text-xs">
        <ShortcutKbd shortcut="nextSubagent" />
      </span>
    </div>
  )
}

/** A subagent's own chat in the panel, read and approved but never replied to: it reports to its parent. Escape goes back. */
export const SubagentView = ({
  agent,
  onBack,
}: {
  agent: Subagent
  onBack: () => void
}) => {
  const { connectionResource } = useConnectionContext()
  const session = useChatSession({
    chatId: agent.chatId,
    connectionResourceId: connectionResource.id,
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  useHotkey('Escape', onBack, { target: ref })

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <div className={headerClassName}>
        <Button
          variant="ghost-muted"
          size="icon-xs"
          aria-label="Back to the chat"
          onClick={onBack}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Button>
        <span data-mask className="min-w-0 flex-1 truncate text-sm font-medium">
          {agent.title}
        </span>
        <span className="text-xs">{STATUS[agent.status]}</span>
        <Kbd className="ml-1.5">Esc</Kbd>
      </div>
      <ChatConversation
        canReply={false}
        isActive={false}
        onNewChat={onBack}
        session={session}
      />
    </div>
  )
}
