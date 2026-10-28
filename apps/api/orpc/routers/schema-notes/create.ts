import { db } from '@tamery/db'
import { schemaNotesInsertSchema } from '@tamery/db/schema'
import { schemaNotes } from '@tamery/db/schema/schema-notes'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const create = orpc
  .use(authMiddleware)
  .input(schemaNotesInsertSchema.omit('userId'))
  .errors({
    NOT_FOUND: { message: 'Connection resource not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const resource = await db.query.connectionsResources.findFirst({
      columns: { id: true },
      where: {
        connection: { userId: { eq: context.user.id } },
        id: { eq: input.connectionResourceId },
      },
    })

    if (!resource) {
      throw errors.NOT_FOUND()
    }

    const [inserted] = await db
      .insert(schemaNotes)
      .values({
        ...input,
        userId: context.user.id,
      })
      .onConflictDoNothing()
      .returning()

    if (inserted) {
      publisher.publish(context.user.id, {
        type: 'insert',
        value: inserted,
      })
    }
  })
