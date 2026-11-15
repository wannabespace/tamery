import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { Kbd } from '@tamery/ui/components/kbd'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useEffect, useRef } from 'react'

import { useConnectionContext } from '~/core/connection/route'

import { ChatConversation } from './chat-conversation'
import { STATUS } from './subagent-status'
import type { Subagent } from './subagents-store'
import { useChatSession } from './use-chat-session'

/** A subagent's own chat in the tab, read and approved but never replied to: it reports to its parent. Escape goes back. */
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
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b pr-1 pl-3">
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
