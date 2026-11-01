import { db } from '@tamery/db'
import { chats, chatsInsertSchema } from '@tamery/db/schema'

import { inMemberWorkspace } from '~/lib/workspace'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

import { publisher } from './events'

export const create = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(chatsInsertSchema.omit('userId', 'title'))
  .errors({
    NOT_FOUND: { message: 'Chat not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const resource = await db.query.connectionsResources.findFirst({
      columns: { id: true },
      where: {
        connection: { RAW: inMemberWorkspace(context.user.id) },
        id: { eq: input.connectionResourceId },
      },
    })
    if (!resource) {
      throw errors.NOT_FOUND()
    }

    const [inserted] = await db
      .insert(chats)
      .values({
        ...input,
        userId: context.user.id,
      })
      .onConflictDoNothing()
      .returning()

    if (!inserted) {
      const existing = input.id
        ? await db.query.chats.findFirst({
            columns: { id: true },
            where: { id: { eq: input.id }, userId: { eq: context.user.id } },
          })
        : undefined
      if (!existing) {
        throw errors.NOT_FOUND()
      }
      return
    }

    publisher.publish(context.user.id, {
      type: 'insert',
      value: inserted,
    })
  })
