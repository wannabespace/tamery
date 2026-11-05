import { ResourceLabel } from '~/core/connection/resource-label'
import type { Connection, ConnectionResource } from '~/core/connection/sync'

export interface CopyEnd {
  connection: Connection
  resource: ConnectionResource
}

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
