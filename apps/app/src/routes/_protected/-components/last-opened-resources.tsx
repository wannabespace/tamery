import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useSubscription } from 'seitu/react'

import { Link } from '~/components/link'
import { useCollections } from '~/core/collections'
import {
  lastOpenedResourcesStorageValue,
  SHOWN_LAST_OPENED_RESOURCES,
} from '~/core/connection/last-opened-resources'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import { useConnectionResourceLinkParams } from '~/core/connection/use-connection-resource-link-params'
import { useActiveWorkspace } from '~/core/workspace/hooks'

const LastOpenedResource = ({
  connectionResource,
  connection,
  onClose,
}: {
  connectionResource: ConnectionResource
  connection: Connection
  onClose: VoidFunction
}) => {
  const params = useConnectionResourceLinkParams(connectionResource.id)

  return (
    <div className="group hover:bg-foreground/5 has-[[data-row-link]:focus-visible]:bg-foreground/10 flex h-7 items-center gap-1 rounded-lg pr-1 pl-2 text-sm">
      <Link
        className="text-foreground hover:text-foreground flex min-w-0 flex-1 cursor-default items-center gap-2.5 outline-hidden"
        preload={false}
        data-row-link
        {...params}
      >
        <ConnectionIcon
          type={connection.type}
          provider={connection.provider}
          className="size-4 shrink-0"
        />
        <span data-mask className="truncate">
          {connection.name}
          <span className="text-muted-foreground">
            {' '}
            / {connectionResource.name}
          </span>
        </span>
      </Link>
      <span className="text-muted-foreground flex shrink-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100 has-focus-visible:opacity-100">
        <IconButton
          variant="ghost-faint"
          size="icon-xs"
          icon={Cancel01Icon}
          label="Remove from recents"
          side="top"
          onClick={onClose}
        />
      </span>
    </div>
  )
}

const close = (resource: ConnectionResource) => {
  lastOpenedResourcesStorageValue.set((prev) =>
    prev.filter((id) => id !== resource.id)
  )
}

export const LastOpenedResources = () => {
  const { connectionsCollection, connectionsResourcesCollection } =
    useCollections()
  const lastOpenedResources = useSubscription(lastOpenedResourcesStorageValue)
  const { data: activeWorkspace } = useActiveWorkspace()

  const { data } = useLiveQuery({
    query: (q) => {
      const query = q
        .from({ connectionsResources: connectionsResourcesCollection })
        .innerJoin(
          { connections: connectionsCollection },
          ({ connectionsResources, connections }) =>
            eq(connectionsResources.connectionId, connections.id)
        )

      return (
        activeWorkspace
          ? query.where(({ connections }) =>
              eq(connections.workspaceId, activeWorkspace.id)
            )
          : query
      ).select(({ connectionsResources, connections }) => ({
        connectionResource: connectionsResources,
        connection: connections,
      }))
    },
  })
  const toShow = data
    .filter(({ connectionResource }) =>
      lastOpenedResources.includes(connectionResource.id)
    )
    .toSorted(
      (a, b) =>
        lastOpenedResources.indexOf(a.connectionResource.id) -
        lastOpenedResources.indexOf(b.connectionResource.id)
    )
    .slice(0, SHOWN_LAST_OPENED_RESOURCES)

  if (toShow.length === 0) {
    return null
  }

  return (
    <div>
      <h3 className="text-2xs text-muted-foreground mb-1.5 px-2 font-semibold tracking-wider uppercase">
        Last Opened
      </h3>
      <div className="flex flex-col gap-0.5">
        {toShow.map(({ connectionResource, connection }) => (
          <LastOpenedResource
            key={connectionResource.id}
            connectionResource={connectionResource}
            connection={connection}
            onClose={() => close(connectionResource)}
          />
        ))}
      </div>
    </div>
  )
}
