import { db } from '@tamery/db'
import { schemaNotes, schemaNotesSelectSchema } from '@tamery/db/schema'
import { type } from 'arktype'
import { addSeconds } from 'date-fns'
import { and, eq, gte, inArray, notInArray, or } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'
import { createSyncOutputSchema, syncDiff } from '~/orpc/lib/sync'

const output = createSyncOutputSchema(schemaNotesSelectSchema).array()

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
            .select({ id: schemaNotes.id })
            .from(schemaNotes)
            .where(
              and(
                eq(schemaNotes.userId, context.user.id),
                inArray(schemaNotes.id, includeIds)
              )
            )
            .then((r) => r.map((i) => i.id)),
        new: (excludeIds) =>
          db
            .select()
            .from(schemaNotes)
            .where(
              and(
                eq(schemaNotes.userId, context.user.id),
                notInArray(schemaNotes.id, excludeIds)
              )
            ),
        updated: (items) =>
          db
            .select()
            .from(schemaNotes)
            .where(
              and(
                eq(schemaNotes.userId, context.user.id),
                or(
                  ...items.map((q) =>
                    and(
                      eq(schemaNotes.id, q.id),
                      gte(schemaNotes.updatedAt, addSeconds(q.updatedAt, 1))
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
