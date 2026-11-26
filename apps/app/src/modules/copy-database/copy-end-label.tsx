import { canQueryConnection } from '~/core/connection/fetching'
import { ResourceLabel } from '~/core/connection/resource-label'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import { getConnectionRunsOn } from '~/core/runtime/machine/pairing'

export interface CopyEnd {
  connection: Connection
  resource: ConnectionResource
}

/** The copy runs this computer's `pg_dump` and `psql`, so both ends must run here: elsewhere `localhost` is another server. */
export const canCopyHere = ({ connection }: CopyEnd) =>
  canQueryConnection(connection) && getConnectionRunsOn(connection.id) === null

export const ConnectionNameLabel = ({
  connection,
}: {
  connection: Connection
}) => (
  <>
    {connection.name}
    {connection.label && (
      <span className="text-muted-foreground"> {connection.label}</span>
    )}
  </>
)

export const CopyEndLabel = ({ connection, resource }: CopyEnd) => (
  <span data-mask className="min-w-0 truncate">
    <ConnectionNameLabel connection={connection} />
    <span className="text-muted-foreground"> / </span>
    <ResourceLabel connection={connection} name={resource.name} />
  </span>
)
