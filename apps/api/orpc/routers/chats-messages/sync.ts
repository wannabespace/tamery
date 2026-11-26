import { db } from '@tamery/db'
import {
  chats,
  chatsMessages,
  chatsMessagesSelectSchema,
} from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq, getColumns } from 'drizzle-orm'
import type { SelectedFields } from 'drizzle-orm/pg-core'

import { authMiddleware, orpc } from '~/orpc'
import { createSyncOutputSchema, idIn, syncDiff } from '~/orpc/lib/sync'

const output = createSyncOutputSchema(chatsMessagesSelectSchema).array()

const userMessages = <TSelection extends SelectedFields>(fields: TSelection) =>
  db
    .select(fields)
    .from(chatsMessages)
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
    const { updatedItems, newItems, missingIds } = await syncDiff({
      input,
      queries: {
        rows: (ids) =>
          userMessages(getColumns(chatsMessages)).where(
            and(owned, idIn(chatsMessages.id, ids))
          ),
        versions: () =>
          userMessages({
            id: chatsMessages.id,
            updatedAt: chatsMessages.updatedAt,
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
