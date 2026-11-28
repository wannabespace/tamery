import { AiNetworkIcon, SidebarRightIcon } from '@hugeicons/core-free-icons'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'

import { ChatDisclosure } from '../messages/chat-disclosure'
import type { ChatToolPart } from '../tools/chat-tool-types'
import { STATUS } from './subagent-status'
import type { SubagentStatus } from './subagents-store'
import { openSubagent, subagentsStore } from './subagents-store'

type SpawnPart = Extract<ChatToolPart, { type: 'tool-spawn_agent' }>

/** On the live turn an unsettled call is a subagent starting; on an earlier one it never finished. */
const partStatus = (
  part: SpawnPart,
  isLive: boolean
): SubagentStatus | 'stopped' => {
  if (part.state === 'output-available') {
    return 'done'
  }
  if (part.state === 'output-error') {
    return 'failed'
  }
  return isLive ? 'running' : 'stopped'
}

/** The line a `spawn_agent` call leaves in its parent's answer: its state, its prompt when opened, and a way into its chat. */
export const SubagentPart = ({
  isLive,
  part,
}: {
  isLive: boolean
  part: SpawnPart
}) => {
  const { connectionResource } = useConnectionContext()
  const live = useSubscription(subagentsStore).find(
    (agent) => agent.toolCallId === part.toolCallId
  )
  const chatId =
    live?.chatId ??
    (part.state === 'output-available' ? part.output.chatId : null)

  const status = live?.status ?? partStatus(part, isLive)

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
