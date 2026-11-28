import { AiNetworkIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { cn } from '@tamery/ui/lib/utils'

import { useConnectionContext } from '~/core/connection/route'

import { ACTIVE, DOT } from './subagent-status'
import type { Subagent } from './subagents-store'
import { openSubagent } from './subagents-store'

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
