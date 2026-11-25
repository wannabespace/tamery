import { db } from '@tamery/db'
import {
  chats,
  chatsMessages,
  chatsMessagesSelectSchema,
} from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq, getColumns, inArray, notInArray, or } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'
import { createSyncOutputSchema, syncDiff, updatedAfter } from '~/orpc/lib/sync'

const output = createSyncOutputSchema(chatsMessagesSelectSchema).array()

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
            .select({ id: chatsMessages.id })
            .from(chatsMessages)
            .innerJoin(chats, eq(chatsMessages.chatId, chats.id))
            .where(
              and(
                eq(chats.userId, context.user.id),
                inArray(chatsMessages.id, includeIds)
              )
            )
            .then((r) => r.map((i) => i.id)),
        new: (excludeIds) =>
          db
            .select(getColumns(chatsMessages))
            .from(chatsMessages)
            .innerJoin(chats, eq(chatsMessages.chatId, chats.id))
            .where(
              and(
                eq(chats.userId, context.user.id),
                notInArray(chatsMessages.id, excludeIds)
              )
            ),
        updated: (items) =>
          db
            .select(getColumns(chatsMessages))
            .from(chatsMessages)
            .innerJoin(chats, eq(chatsMessages.chatId, chats.id))
            .where(
              and(
                eq(chats.userId, context.user.id),
                or(
                  ...items.map((m) =>
                    and(
                      eq(chatsMessages.id, m.id),
                      updatedAfter(chatsMessages.updatedAt, m.updatedAt)
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
