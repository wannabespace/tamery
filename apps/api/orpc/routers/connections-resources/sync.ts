import { db } from '@tamery/db'
import {
  connections,
  connectionsResources,
  connectionsResourcesSelectSchema,
} from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq, getColumns } from 'drizzle-orm'
import type { SelectedFields } from 'drizzle-orm/pg-core'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'
import { createSyncOutputSchema, idIn, syncDiff } from '~/orpc/lib/sync'

const output = createSyncOutputSchema(connectionsResourcesSelectSchema).array()

const userResources = <TSelection extends SelectedFields>(fields: TSelection) =>
  db
    .select(fields)
    .from(connectionsResources)
    .innerJoin(
      connections,
      eq(connectionsResources.connectionId, connections.id)
    )

export const sync = orpc
  .use(authMiddleware)
  .input(
    type({
      id: 'string.uuid.v7',
      updatedAt: 'Date',
    }).array()
  )
  .output(output)
  .handler(async ({ input, context }) => {
    const owned = inMemberWorkspace(context.user.id)(connections)
    const { updatedItems, newItems, missingIds } = await syncDiff({
      input,
      queries: {
        rows: (ids) =>
          userResources(getColumns(connectionsResources)).where(
            and(owned, idIn(connectionsResources.id, ids))
          ),
        versions: () =>
          userResources({
            id: connectionsResources.id,
            updatedAt: connectionsResources.updatedAt,
          }).where(owned),
      },
    })
    const result: typeof output.infer = []

    for (const item of updatedItems) {
      result.push({
        type: 'update',
        value: item,
      })
    }

    for (const item of newItems) {
      result.push({
        type: 'insert',
        value: item,
      })
    }

    for (const item of missingIds) {
      result.push({
        key: item,
        type: 'delete',
      })
    }

    return result
  })
