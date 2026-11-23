import { db } from '@tamery/db'
import { machines, machinesSelectSchema } from '@tamery/db/schema'
import { type } from 'arktype'
import { addSeconds } from 'date-fns'
import { and, eq, gte, inArray, notInArray, or } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'
import { createSyncOutputSchema, syncDiff } from '~/orpc/lib/sync'

const output = createSyncOutputSchema(machinesSelectSchema).array()

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
            .select({ id: machines.id })
            .from(machines)
            .where(
              and(
                eq(machines.userId, context.user.id),
                inArray(machines.id, includeIds)
              )
            )
            .then((r) => r.map((i) => i.id)),
        new: (excludeIds) =>
          db
            .select()
            .from(machines)
            .where(
              and(
                eq(machines.userId, context.user.id),
                notInArray(machines.id, excludeIds)
              )
            ),
        updated: (items) =>
          db
            .select()
            .from(machines)
            .where(
              and(
                eq(machines.userId, context.user.id),
                or(
                  ...items.map((row) =>
                    and(
                      eq(machines.id, row.id),
                      gte(machines.updatedAt, addSeconds(row.updatedAt, 1))
                    )
                  )
                )
              )
            ),
      },
    })

    const messages: typeof output.infer = []

    for (const item of updatedItems) {
      messages.push({
        type: 'update',
        value: item,
      })
    }

    for (const item of newItems) {
      messages.push({
        type: 'insert',
        value: item,
      })
    }

    for (const item of missingIds) {
      messages.push({
        key: item,
        type: 'delete',
      })
    }

    return messages
  })
