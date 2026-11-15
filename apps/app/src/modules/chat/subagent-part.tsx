import { AiNetworkIcon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'

import type { ChatToolPart } from './chat-tool-types'
import { STATUS } from './subagent-status'
import type { SubagentStatus } from './subagents-store'
import { openSubagent, subagentsStore } from './subagents-store'

type SpawnPart = Extract<ChatToolPart, { type: 'tool-spawn_agent' }>

const partStatus = (part: SpawnPart): SubagentStatus | 'stopped' => {
  if (part.state === 'output-available') {
    return 'done'
  }
  return part.state === 'output-error' ? 'failed' : 'stopped'
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
