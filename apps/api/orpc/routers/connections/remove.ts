import { db } from '@tamery/db'
import { connections } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { inEditableWorkspace, publishToWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .errors({
    FORBIDDEN: { message: 'Only editors can remove connections.' },
  })
  .handler(async ({ context, errors, input: { id } }) => {
    const [removed] = await db
      .delete(connections)
      .where(
        and(
          eq(connections.id, id),
          inEditableWorkspace(context.user.id)(connections)
        )
      )
      .returning({ workspaceId: connections.workspaceId })

    if (removed) {
      await publishToWorkspace(publisher, removed.workspaceId, {
        key: id,
        type: 'delete',
      })
      return
    }

    if (await db.$count(connections, eq(connections.id, id))) {
      throw errors.FORBIDDEN()
    }

    publisher.publish(context.user.id, { key: id, type: 'delete' })
  })
