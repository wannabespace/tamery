import type { McpCall, McpTool } from '@tamery/shared/mcp'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'

import type { Connection } from '~/core/connection/sync'

import { clientLabel } from './clients'

const TOOL_LABELS: Record<McpTool, string> = {
  column_values: 'read column values',
  create_connection: 'created a connection',
  describe_table: 'described a table',
  execute: 'ran a change',
  list_connections: 'listed connections',
  list_tables: 'listed tables',
  query: 'ran a query',
  search_schema: 'searched the schema',
}

export interface ActivityEntry {
  call: McpCall
  connection: Connection | null
}

export const CallTitle = ({ call, connection }: ActivityEntry) => (
  <>
    {clientLabel(call.client)}
    <span className="text-muted-foreground font-normal">
      {TOOL_LABELS[call.tool]}
    </span>
    {connection && (
      <>
        <ConnectionIcon
          type={connection.type}
          provider={connection.provider}
          className="size-4"
        />
        <span data-mask className="truncate">
          {call.resource
            ? `${connection.name} / ${call.resource}`
            : connection.name}
        </span>
      </>
    )}
  </>
)
