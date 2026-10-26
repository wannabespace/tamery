import { eq } from '@tanstack/react-db'
import type { InitialQueryBuilder } from '@tanstack/react-db'

import type { Workspace } from '~/core/workspace/sync'

import type { createConnectionsCollection } from './sync'

type ConnectionsCollection = ReturnType<typeof createConnectionsCollection>

export const workspaceConnections = (
  q: InitialQueryBuilder,
  connections: ConnectionsCollection,
  activeWorkspace: Workspace | null
) => {
  const scoped = q.from({ connection: connections })

  return activeWorkspace
    ? scoped.where(({ connection }) =>
        eq(connection.workspaceId, activeWorkspace.id)
      )
    : scoped
}
