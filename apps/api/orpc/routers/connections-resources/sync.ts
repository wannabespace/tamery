import { db } from '@tamery/db'
import {
  connections,
  connectionsResources,
  connectionsResourcesSelectSchema,
} from '@tamery/db/schema'
import { type } from 'arktype'
import { addSeconds } from 'date-fns'
import { and, eq, getColumns, gte, inArray, notInArray, or } from 'drizzle-orm'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'
import { createSyncOutputSchema, syncDiff } from '~/orpc/lib/sync'

const output = createSyncOutputSchema(connectionsResourcesSelectSchema).array()

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
    const { updatedItems, newItems, missingIds } = await syncDiff({
      input,
      queries: {
        existing: (includeIds) =>
          db
            .select({ id: connectionsResources.id })
            .from(connectionsResources)
            .innerJoin(
              connections,
              eq(connectionsResources.connectionId, connections.id)
            )
            .where(
              and(
                inMemberWorkspace(context.user.id)(connections),
                inArray(connectionsResources.id, includeIds)
              )
            )
            .then((r) => r.map((i) => i.id)),
        new: (excludeIds) =>
          db
            .select(getColumns(connectionsResources))
            .from(connectionsResources)
            .innerJoin(
              connections,
              eq(connectionsResources.connectionId, connections.id)
            )
            .where(
              and(
                inMemberWorkspace(context.user.id)(connections),
                notInArray(connectionsResources.id, excludeIds)
              )
            ),
        updated: (items) =>
          db
            .select(getColumns(connectionsResources))
            .from(connectionsResources)
            .innerJoin(
              connections,
              eq(connectionsResources.connectionId, connections.id)
            )
            .where(
              and(
                inMemberWorkspace(context.user.id)(connections),
                or(
                  ...items.map((cr) =>
                    and(
                      eq(connectionsResources.id, cr.id),
                      gte(
                        connectionsResources.updatedAt,
                        addSeconds(cr.updatedAt, 1)
                      )
                    )
                  )
                )
              )
            ),
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
