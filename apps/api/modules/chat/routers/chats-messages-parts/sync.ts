import { db } from '@tamery/db'
import {
  chats,
  chatsMessages,
  chatsMessagesParts,
  chatsMessagesPartsSelectSchema,
} from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq, getColumns } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'
import { createSyncOutputSchema, idIn, syncDiff } from '~/orpc/lib/sync'

const output = createSyncOutputSchema(chatsMessagesPartsSelectSchema).array()

const userParts = () =>
  db
    .select(getColumns(chatsMessagesParts))
    .from(chatsMessagesParts)
    .innerJoin(
      chatsMessages,
      eq(chatsMessagesParts.messageId, chatsMessages.id)
    )
    .innerJoin(chats, eq(chatsMessages.chatId, chats.id))

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
    const owned = eq(chats.userId, context.user.id)
    const { newItems, missingIds } = await syncDiff({
      input,
      queries: {
        rows: (ids) =>
          userParts().where(and(owned, idIn(chatsMessagesParts.id, ids))),
        versions: () =>
          db
            .select({
              id: chatsMessagesParts.id,
              updatedAt: chatsMessagesParts.updatedAt,
            })
            .from(chatsMessagesParts)
            .innerJoin(
              chatsMessages,
              eq(chatsMessagesParts.messageId, chatsMessages.id)
            )
            .innerJoin(chats, eq(chatsMessages.chatId, chats.id))
            .where(owned),
      },
    })

    const result: typeof output.infer = []

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
