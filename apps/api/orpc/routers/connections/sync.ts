import { db } from '@tamery/db'
import { connections } from '@tamery/db/schema'
import { type } from 'arktype'
import { and } from 'drizzle-orm'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'
import { idIn, syncDiff } from '~/orpc/lib/sync'

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
    const owned = inMemberWorkspace(context.user.id)(connections)
    const { updatedItems, newItems, missingIds } = await syncDiff({
      input,
      queries: {
        rows: (ids) =>
          db
            .select(syncedColumns)
            .from(connections)
            .where(and(owned, idIn(connections.id, ids))),
        versions: () =>
          db
            .select({ id: connections.id, updatedAt: connections.updatedAt })
            .from(connections)
            .where(owned),
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
