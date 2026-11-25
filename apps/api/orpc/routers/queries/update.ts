import { db } from '@tamery/db'
import { queriesUpdateSchema } from '@tamery/db/schema'
import { queries } from '@tamery/db/schema/queries'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const update = orpc
  .use(authMiddleware)
  .input(
    queriesUpdateSchema
      .pick('name')
      .merge(queriesUpdateSchema.pick('id').required())
  )
  .errors({
    NOT_FOUND: { message: 'Saved query not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const { id, ...changes } = input

    const [updated] = await db
      .update(queries)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(queries.id, id), eq(queries.userId, context.user.id)))
      .returning()

    if (!updated) {
      throw errors.NOT_FOUND()
    }

    await publisher.publish(context.user.id, {
      type: 'update',
      value: updated,
    })
  })
