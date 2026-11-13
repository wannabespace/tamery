import { AiNetworkIcon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AppUIMessage } from '@tamery/ai/message'
import { Button } from '@tamery/ui/components/button'
import { Spinner } from '@tamery/ui/components/spinner'
import type { ReactNode } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { posthog } from '~/lib/posthog'

import type { ChatToolPart } from './chat-tool-types'
import type { Subagent, SubagentStatus } from './subagents-store'
import { openSubagentStore, subagentsStore } from './subagents-store'

export const STATUS: Record<SubagentStatus | 'stopped', ReactNode> = {
  done: <span className="text-muted-foreground">Done</span>,
  failed: <span className="text-destructive">Failed</span>,
  running: (
    <span className="text-muted-foreground flex items-center gap-1.5">
      <Spinner className="size-3" />
      Working
    </span>
  ),
  stopped: <span className="text-muted-foreground">Stopped</span>,
  waiting: <span className="text-warning">Needs approval</span>,
}

export const DOT: Record<SubagentStatus, string> = {
  done: 'bg-muted-foreground/50',
  failed: 'bg-destructive',
  running: 'bg-primary animate-pulse',
  waiting: 'bg-warning',
}

type SpawnPart = Extract<ChatToolPart, { type: 'tool-spawn_agent' }>

const partStatus = (part: SpawnPart): SubagentStatus | 'stopped' => {
  if (part.state === 'output-available') {
    return 'done'
  }
  return part.state === 'output-error' ? 'failed' : 'stopped'
}

/** A chat's subagents in the order they started: the live ones of this window, then the finished ones of its transcript. */
export const useSubagents = (
  parentChatId: string,
  messages: AppUIMessage[]
) => {
  const live = useSubscription(subagentsStore).filter(
    (agent) => agent.parentChatId === parentChatId
  )
  const finished = messages.flatMap((message) =>
    message.parts.flatMap((part): Subagent[] =>
      part.type === 'tool-spawn_agent' &&
      part.state === 'output-available' &&
      !live.some((agent) => agent.chatId === part.output.chatId)
        ? [
            {
              chatId: part.output.chatId,
              parentChatId,
              status: 'done',
              title: part.input.title,
              toolCallId: part.toolCallId,
            },
          ]
        : []
    )
  )
  return [...finished, ...live]
}

export const openSubagent = (resourceId: string, chatId: string | null) => {
  openSubagentStore(resourceId).set(chatId)
  if (chatId) {
    posthog.capture('ai_chat_subagent_opened')
  }
}

/** The line a `spawn_agent` call leaves in its parent's answer; pressing it shows the subagent's chat. */
export const SubagentPart = ({ part }: { part: SpawnPart }) => {
  const { connectionResource } = useConnectionContext()
  const live = useSubscription(subagentsStore).find(
    (agent) => agent.toolCallId === part.toolCallId
  )
  const chatId =
    live?.chatId ??
    (part.state === 'output-available' ? part.output.chatId : null)

  return (
    <Button
      variant="ghost-muted"
      size="sm"
      className="w-full justify-start"
      disabled={!chatId}
      onClick={() => chatId && openSubagent(connectionResource.id, chatId)}
    >
      <HugeiconsIcon icon={AiNetworkIcon} strokeWidth={2} />
      <span className="text-foreground truncate">
        {part.input?.title ?? 'Subagent'}
      </span>
      <span className="ml-auto text-xs">
        {STATUS[live?.status ?? partStatus(part)]}
      </span>
      {chatId && <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />}
    </Button>
  )
}
