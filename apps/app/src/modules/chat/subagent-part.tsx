import {
  AiNetworkIcon,
  SidebarRightIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AppUIMessage } from '@tamery/ai/message'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import type { ReactNode } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { posthog } from '~/lib/posthog'

import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart } from './chat-tool-types'
import type { Subagent, SubagentStatus } from './subagents-store'
import { openSubagentStore, subagentsStore } from './subagents-store'

export const STATUS: Record<SubagentStatus | 'stopped', ReactNode> = {
  done: (
    <span className="text-muted-foreground flex items-center gap-1">
      <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3" />
      Done
    </span>
  ),
  failed: <span className="text-destructive">Failed</span>,
  running: <span className="text-muted-foreground shimmer">Working</span>,
  stopped: <span className="text-muted-foreground">Stopped</span>,
  waiting: <span className="text-warning">Needs approval</span>,
}

export const DOT: Record<SubagentStatus, string> = {
  done: 'bg-muted-foreground/50',
  failed: 'bg-destructive',
  running: 'bg-primary',
  waiting: 'bg-warning',
}

type SpawnPart = Extract<ChatToolPart, { type: 'tool-spawn_agent' }>

/** On the live turn an unsettled call is a subagent starting; on an earlier one it never finished. */
const partStatus = (
  part: SpawnPart,
  isLast: boolean
): SubagentStatus | 'stopped' => {
  if (part.state === 'output-available') {
    return 'done'
  }
  if (part.state === 'output-error') {
    return 'failed'
  }
  return isLast ? 'running' : 'stopped'
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

/** The line a `spawn_agent` call leaves in its parent's answer: its state, its prompt when opened, and a way into its chat. */
export const SubagentPart = ({
  isLast,
  part,
}: {
  isLast: boolean
  part: SpawnPart
}) => {
  const { connectionResource } = useConnectionContext()
  const live = useSubscription(subagentsStore).find(
    (agent) => agent.toolCallId === part.toolCallId
  )
  const chatId =
    live?.chatId ??
    (part.state === 'output-available' ? part.output.chatId : null)

  const status = live?.status ?? partStatus(part, isLast)

  return (
    <ChatDisclosure
      icon={AiNetworkIcon}
      label={
        part.input?.title
          ? `${status === 'running' ? 'Running' : 'Ran'} a subagent: ${part.input.title}`
          : 'Subagent'
      }
      live={status === 'running'}
      status={status !== 'running' && STATUS[status]}
      action={
        chatId && (
          <IconButton
            icon={SidebarRightIcon}
            label="Open the subagent"
            side="top"
            size="icon-2xs"
            variant="ghost-muted"
            onClick={() => openSubagent(connectionResource.id, chatId)}
          />
        )
      }
    >
      <p
        data-mask
        className="text-muted-foreground text-xs whitespace-pre-wrap"
      >
        {part.input?.task}
      </p>
    </ChatDisclosure>
  )
}
