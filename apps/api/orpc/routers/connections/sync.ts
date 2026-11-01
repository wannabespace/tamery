import { db } from '@tamery/db'
import { connections } from '@tamery/db/schema'
import { type } from 'arktype'
import { addSeconds } from 'date-fns'
import { and, eq, gte, inArray, notInArray, or } from 'drizzle-orm'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'
import { syncDiff } from '~/orpc/lib/sync'

import { output as eventOutput, syncedColumns } from './events'

const output = eventOutput.array()

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
            .select({ id: connections.id })
            .from(connections)
            .where(
              and(
                inMemberWorkspace(context.user.id)(connections),
                inArray(connections.id, includeIds)
              )
            )
            .then((r) => r.map((i) => i.id)),
        new: (excludeIds) =>
          db
            .select(syncedColumns)
            .from(connections)
            .where(
              and(
                inMemberWorkspace(context.user.id)(connections),
                notInArray(connections.id, excludeIds)
              )
            ),
        updated: (items) =>
          db
            .select(syncedColumns)
            .from(connections)
            .where(
              and(
                inMemberWorkspace(context.user.id)(connections),
                or(
                  ...items.map((c) =>
                    and(
                      eq(connections.id, c.id),
                      gte(connections.updatedAt, addSeconds(c.updatedAt, 1))
                    )
                  )
                )
              )
            ),
      },
    })
    const syncResult: typeof output.infer = []

    for (const value of updatedItems) {
      syncResult.push({ type: 'update', value })
    }

    for (const value of newItems) {
      syncResult.push({ type: 'insert', value })
    }

    for (const item of missingIds) {
      syncResult.push({
        key: item,
        type: 'delete',
      })
    }

    return syncResult
  })
