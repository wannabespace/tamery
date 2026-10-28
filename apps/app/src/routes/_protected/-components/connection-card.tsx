import { connectionSecrets } from '@tamery/connection/secrets'
import { resourceConnectionString } from '@tamery/connection/utils'
import { CONNECTION_RESOURCE_ROOT_SYMBOL } from '@tamery/shared/constants'
import { pick } from '@tamery/shared/utils'
import { EDITOR_ROLES } from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { copy } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import { useCollections } from '~/core/collections'
import { ConnectionResourceLink } from '~/core/connection/connection-resource-link'
import { useFetchingConfig } from '~/core/connection/fetching'
import { createConnection } from '~/core/connection/save'
import { getConnectionStore } from '~/core/connection/stores'
import type { Connection } from '~/core/connection/sync'
import { connectionResourcesQueryOptions } from '~/core/queries/connection/resources'
import { checkOrUpgrade } from '~/core/user/permissions'
import { useActiveWorkspace } from '~/core/workspace/hooks'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { getCopyDatabaseAction } from '~/modules/copy-database/copy-database-dialog'
import { useIsOnline } from '~/store'
import { openNewWindow } from '~/utils/new-window'

import { ConnectionCardMeta } from './connection-card-meta'
import { ConnectionCardStatus } from './connection-card-status'
import { ConnectionIconWithVersion } from './connection-icon-with-version'
import { buildConnectionMenuItems } from './connection-menu-items'

export const ConnectionCard = ({
  connection,
  onRemove,
  search,
}: {
  connection: Connection
  onRemove: VoidFunction
  search: string
}) => {
  const router = useRouter()
  const {
    connectionStringsCollection,
    connectionsCollection,
    connectionsResourcesCollection,
  } = useCollections()
  const { workspaces } = useActiveWorkspace()
  const isOnline = useIsOnline()
  const editableWorkspaces = workspaces.filter((workspace) =>
    EDITOR_ROLES.includes(workspace.role)
  )
  const connectionWorkspace = editableWorkspaces.find(
    (workspace) => workspace.id === connection.workspaceId
  )
  const moveTargets = editableWorkspaces.filter(
    (workspace) => workspace !== connectionWorkspace
  )
  const { data: connectionString } = useLiveQuery({
    query: (q) =>
      q
        .from({ cs: connectionStringsCollection })
        .where(({ cs }) => eq(cs.connectionId, connection.id))
        .findOne(),
  })
  const { data: connectionResources } = useLiveQuery({
    query: (q) =>
      q
        .from({ cr: connectionsResourcesCollection })
        .where(({ cr }) => eq(cr.connectionId, connection.id))
        .orderBy(({ cr }) => cr.name, 'asc'),
  })

  const connectionResourcesNames = connectionResources.map(
    (r) => r.name || CONNECTION_RESOURCE_ROOT_SYMBOL
  )
  const { type: fetchType, canSend, reason } = useFetchingConfig(connection)

  const {
    data: resources = connectionResourcesNames,
    isFetching,
    error,
    refetch,
  } = useQuery({
    ...connectionResourcesQueryOptions(connection),
    enabled: canSend,
  })
  const refresh = useMutation({
    meta: { event: 'connection_refreshed' },
    mutationFn: () => refetch(),
  })

  const defaultResourceName = connectionString?.defaultResourceName ?? null

  const connectionStore = getConnectionStore(connection.id)
  const selectedResourceName = useSubscription(connectionStore, {
    selector: (state) =>
      (state.lastOpenedResourceName ||
        defaultResourceName ||
        resources[0] ||
        null) as string | typeof CONNECTION_RESOURCE_ROOT_SYMBOL | null,
  })
  const resolvedSelectedResourceName =
    selectedResourceName === CONNECTION_RESOURCE_ROOT_SYMBOL
      ? null
      : selectedResourceName
  const selectedResource = connectionResources.find(
    (r) => r.name === resolvedSelectedResourceName
  )
  const needsDetails = fetchType === 'waiting-for-details'
  const canOpenResource =
    canSend || needsDetails || fetchType === 'waiting-for-password'
  const openResourceId = canOpenResource ? selectedResource?.id : undefined

  const handleCopy = async () =>
    copy(
      resourceConnectionString(
        connectionSecrets.copyable(
          await connectionStringsCollection.utils.decrypt(connection.id)
        ),
        resolvedSelectedResourceName
      ),
      'Connection string copied'
    )

  const handleClearPassword = async () => {
    const record = connectionStringsCollection.get(connection.id)
    if (!record) {
      return
    }

    const saved = await connectionStringsCollection.utils.decrypt(connection.id)
    if (!connectionSecrets.stored(saved)) {
      toast.info('No credentials are saved on this device')
      return
    }

    const { write } = await connectionStringsCollection.utils.prepareWrite({
      connectionId: connection.id,
      connectionString: connectionSecrets.strip(saved),
      updatedAt: record.updatedAt,
    })
    write()

    posthog.capture('connection_password_cleared')
    toast.success('Credentials cleared from this device')
  }

  const copyTo = useMutation({
    meta: { event: 'connection_copied' },
    mutationFn: async (workspaceId: string) =>
      createConnection({
        ...pick(connection, ['color', 'label', 'provider', 'syncType', 'type']),
        connectionString: await connectionStringsCollection.utils.decrypt(
          connection.id
        ),
        name:
          workspaceId === connection.workspaceId
            ? `${connection.name} copy`
            : connection.name,
        workspaceId,
      }),
    onError: (copyError) => toast.error(copyError.message),
    onSuccess: () => toast.success('Connection copied'),
  })
  const moveTo = useMutation({
    meta: { event: 'connection_moved' },
    mutationFn: (workspaceId: string) =>
      orpc.connections.move.call({ id: connection.id, workspaceId }),
    onSuccess: () => toast.success('Connection moved'),
  })

  const isLoadingVisible =
    (isFetching && connectionResourcesNames.length === 0) || refresh.isPending

  const items = buildConnectionMenuItems({
    canEdit: !!connectionWorkspace,
    canSend,
    connection,
    copyTargets: connectionWorkspace
      ? [connectionWorkspace, ...moveTargets]
      : moveTargets,
    isOnline,
    moveTargets,
    onClearPassword: handleClearPassword,
    onCopy: handleCopy,
    onCopyDatabase: getCopyDatabaseAction(
      selectedResource ? { connection, resource: selectedResource } : null
    ),
    onCopyTo: (workspaceId) => {
      if (
        checkOrUpgrade('connection.create', {
          count: connectionsCollection.size,
        })
      ) {
        copyTo.mutate(workspaceId)
      }
    },
    onEdit: () => {
      posthog.capture('connection_edit_opened')
      void router.navigate({
        params: { connectionId: connection.id },
        to: '/edit/$connectionId',
      })
    },
    onOpenInNewWindow: openResourceId
      ? () =>
          openNewWindow(
            router.buildLocation({
              params: { resourceId: openResourceId },
              to: '/connection/$resourceId',
            }).href
          )
      : null,
    onMoveTo: moveTo.mutate,
    onRefresh: () => refresh.mutate(),
    onRemove,
  })

  return (
    <div
      style={{ '--color': connection.color } as CSSProperties}
      className="relative flex flex-col border-b last:border-b-0"
    >
      <AppContextMenu
        items={items}
        contentProps={{ className: 'min-w-44' }}
        render={
          <div
            className={cn(
              'group has-[[data-row-link]:focus-visible]:bg-accent relative flex h-9 items-center gap-3 pr-2 pl-3 select-none',
              openResourceId &&
                'hover:bg-accent has-[[data-row-link]:hover]:bg-accent'
            )}
          />
        }
      >
        {openResourceId && (
          <ConnectionResourceLink
            resourceId={openResourceId}
            className="focus-visible:inset-ring-ring/50 absolute inset-0 cursor-default outline-hidden focus-visible:inset-ring-3"
            aria-label={`Open ${connection.name}`}
            preload={false}
            data-row-link
          />
        )}
        {connection.color && (
          <span className="pointer-events-none absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-(--color)" />
        )}
        <div
          className={cn(
            'pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-3',
            isLoadingVisible && 'animate-pulse'
          )}
        >
          <ConnectionIconWithVersion connection={connection} />
          <div className="flex min-w-0 items-center gap-2">
            <span
              data-mask
              title={connection.name}
              className="truncate text-sm leading-none"
            >
              <HighlightText text={connection.name} match={search} />
            </span>
            <ConnectionCardStatus
              canSend={canSend}
              connectionId={connection.id}
              error={error}
              isLoadingVisible={isLoadingVisible}
              reason={reason}
            />
          </div>
        </div>
        <ConnectionCardMeta
          canSend={canSend}
          connection={connection}
          databaseKnown={!needsDetails}
          displayUrl={connectionString?.displayUrl}
          openResourceId={openResourceId}
          resources={resources}
          selectedResourceName={selectedResourceName}
        />
        <AppMenuButton
          variant="muted"
          items={items}
          contentProps={{ className: 'min-w-44' }}
          render={<Button variant="ghost-faint" size="icon-xs" />}
          className="relative z-10 -ml-2"
        />
      </AppContextMenu>
    </div>
  )
}
