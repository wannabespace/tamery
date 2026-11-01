import { pick } from '@tamery/shared/utils'
import { EDITOR_ROLES } from '@tamery/shared/workspace'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useCollections } from '~/core/collections'
import { createConnection } from '~/core/connection/save'
import type { Connection } from '~/core/connection/sync'
import { checkOrUpgrade } from '~/core/user/permissions'
import { useActiveWorkspace } from '~/core/workspace/hooks'
import { orpc } from '~/lib/orpc'
import { useIsOnline } from '~/store'

export const useConnectionTransfer = (connection: Connection) => {
  const { connectionStringsCollection, connectionsCollection } =
    useCollections()
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

  return {
    canEdit: !!connectionWorkspace,
    copyTargets: connectionWorkspace
      ? [connectionWorkspace, ...moveTargets]
      : moveTargets,
    isOnline,
    moveTargets,
    onCopyTo: (workspaceId: string) => {
      if (
        checkOrUpgrade('connection.create', {
          count: connectionsCollection.size,
        })
      ) {
        copyTo.mutate(workspaceId)
      }
    },
    onMoveTo: moveTo.mutate,
  }
}
