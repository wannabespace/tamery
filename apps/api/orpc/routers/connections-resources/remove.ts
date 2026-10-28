import { db } from '@tamery/db'
import { connections, connectionsResources } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { inEditableWorkspace, publishToWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input: { id } }) => {
    const [owned] = await db
      .select({ workspaceId: connections.workspaceId })
      .from(connectionsResources)
      .innerJoin(
        connections,
        eq(connections.id, connectionsResources.connectionId)
      )
      .where(
        and(
          eq(connectionsResources.id, id),
          inEditableWorkspace(context.user.id)(connections)
        )
      )

    if (!owned) {
      return
    }

    await db.delete(connectionsResources).where(eq(connectionsResources.id, id))

    await publishToWorkspace(publisher, owned.workspaceId, {
      key: id,
      type: 'delete',
    })
  })
