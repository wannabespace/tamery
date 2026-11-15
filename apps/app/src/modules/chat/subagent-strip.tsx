import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'

import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'

import { DOT } from './subagent-status'
import type { Subagent } from './subagents-store'
import { openSubagent } from './subagents-store'

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
