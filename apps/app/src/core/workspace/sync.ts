import type { WorkspaceRole } from '@tamery/shared/workspace'
import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { createCollection } from '@tanstack/react-db'

import { persistence } from '~/lib/database'
import { orpc } from '~/lib/orpc'
import type { BaseTable } from '~/lib/sync'
import { PERSISTED_SCHEMA_VERSION, syncCollectionOptions } from '~/lib/sync'

export interface Workspace extends BaseTable {
  name: string
  slug: string
  logo: string | null
  metadata: string | null
  role: WorkspaceRole
}

export const createWorkspacesCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<Workspace>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.workspaces.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'workspaces',
        sync: ({ rows, signal }) => orpc.workspaces.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )
