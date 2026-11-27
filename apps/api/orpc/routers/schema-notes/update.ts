import { SCHEMA_NOTE_LIMIT } from '@tamery/ai/schema-notes'
import { db } from '@tamery/db'
import { schemaNotesUpdateSchema } from '@tamery/db/schema'
import { schemaNotes } from '@tamery/db/schema/schema-notes'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const update = orpc
  .use(authMiddleware)
  .input(
    schemaNotesUpdateSchema
      .pick('id')
      .required()
      .merge({ 'note?': `string <= ${SCHEMA_NOTE_LIMIT}` })
  )
  .errors({
    NOT_FOUND: { message: 'Note not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const { id, ...changes } = input

    const [updated] = await db
      .update(schemaNotes)
      .set({ ...changes, updatedAt: new Date() })
      .where(
        and(eq(schemaNotes.id, id), eq(schemaNotes.userId, context.user.id))
      )
      .returning()

    if (!updated) {
      throw errors.NOT_FOUND()
    }

    publisher.publish(context.user.id, {
      type: 'update',
      value: updated,
    })
    return updated
  })
