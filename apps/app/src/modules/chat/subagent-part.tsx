import {
  AiNetworkIcon,
  ArrowRight01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AppUIMessage } from '@tamery/ai/message'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { Response } from '@tamery/ui/components/response'
import type { ReactNode } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { posthog } from '~/lib/posthog'

import type { ChatToolPart } from './chat-tool-types'
import { Clamped } from './clamped'
import type { Subagent, SubagentStatus } from './subagents-store'
import { openSubagentStore, subagentsStore } from './subagents-store'
import { ToolCard, ToolCardHeader } from './tool-card'

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

/** The card a `spawn_agent` call leaves in its parent's answer: its task while it works, its report once done, and a way into its chat. */
export const SubagentPart = ({ part }: { part: SpawnPart }) => {
  const { connectionResource } = useConnectionContext()
  const live = useSubscription(subagentsStore).find(
    (agent) => agent.toolCallId === part.toolCallId
  )
  const chatId =
    live?.chatId ??
    (part.state === 'output-available' ? part.output.chatId : null)

  return (
    <ToolCard>
      <ToolCardHeader
        icon={<HugeiconsIcon icon={AiNetworkIcon} strokeWidth={2} />}
        title={
          <>
            <span className="text-muted-foreground font-normal">Subagent</span>{' '}
            <span data-mask>{part.input?.title}</span>
          </>
        }
        status={STATUS[live?.status ?? partStatus(part)]}
        actions={
          chatId && (
            <IconButton
              icon={ArrowRight01Icon}
              label="Open the subagent"
              side="top"
              size="icon-xs"
              variant="ghost-muted"
              onClick={() => openSubagent(connectionResource.id, chatId)}
            />
          )
        }
      />
      <div
        data-mask
        className="text-muted-foreground flex flex-col items-start px-3 py-2.5 text-xs"
      >
        <Clamped height="short">
          {part.state === 'output-available' ? (
            <Response>{part.output.answer}</Response>
          ) : (
            <p>{part.input?.task}</p>
          )}
        </Clamped>
      </div>
    </ToolCard>
  )
}
