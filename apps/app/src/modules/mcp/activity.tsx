import { SourceCodeIcon } from '@hugeicons/core-free-icons'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceStrict } from 'date-fns'
import { useState } from 'react'

import { useCollections } from '~/core/collections'
import { posthog } from '~/lib/posthog'

import { CallDialog } from './call-dialog'
import type { ActivityEntry } from './call-title'
import { CallTitle } from './call-title'
import { mcpCallsQuery } from './use-mcp-server'

export const Activity = () => {
  const { connectionsCollection } = useCollections()
  const { data: connections } = useLiveQuery({
    query: (q) => q.from({ connection: connectionsCollection }),
  })
  const { data: calls, dataUpdatedAt } = useQuery(mcpCallsQuery)
  const [open, setOpen] = useState(false)
  const [entry, setEntry] = useState<ActivityEntry | null>(null)

  if (!calls?.length) {
    return null
  }

  return (
    <>
      <SettingsGroup title="Activity">
        <ScrollArea className="max-h-72">
          {calls.map((call) => {
            const connection =
              connections.find(({ id }) => id === call.connectionId) ?? null

            return (
              <SettingsRow
                key={call.id}
                dense
                title={<CallTitle call={call} connection={connection} />}
                description={
                  (call.detail || call.error) && (
                    <>
                      {call.detail && (
                        <span data-mask className="font-mono text-xs">
                          {call.detail}
                        </span>
                      )}
                      {call.error && (
                        <span
                          data-mask
                          className="text-destructive block truncate"
                        >
                          {call.error}
                        </span>
                      )}
                    </>
                  )
                }
              >
                {call.query && (
                  <IconButton
                    icon={SourceCodeIcon}
                    label="Show query"
                    size="icon-xs"
                    variant="ghost-muted"
                    onClick={() => {
                      posthog.capture('mcp_activity_query_opened', {
                        tool: call.tool,
                      })
                      setEntry({ call, connection })
                      setOpen(true)
                    }}
                  />
                )}
                <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                  {formatDistanceStrict(call.at, dataUpdatedAt, {
                    addSuffix: true,
                  })}
                </span>
              </SettingsRow>
            )
          })}
        </ScrollArea>
      </SettingsGroup>
      <CallDialog entry={entry} open={open} onOpenChange={setOpen} />
    </>
  )
}
