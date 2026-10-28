import { db } from '@tamery/db'
import { queriesInsertSchema } from '@tamery/db/schema'
import { queries } from '@tamery/db/schema/queries'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const create = orpc
  .use(authMiddleware)
  .input(queriesInsertSchema.omit('userId'))
  .errors({
    NOT_FOUND: { message: 'Connection resource not found' },
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
      .insert(queries)
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
