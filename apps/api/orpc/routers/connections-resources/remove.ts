import { db } from '@tamery/db'
import { connectionsResources } from '@tamery/db/schema'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'

import { inEditableWorkspace, publishToWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input: { id } }) => {
    const owned = await db.query.connectionsResources.findFirst({
      columns: {
        id: true,
      },
      where: {
        connection: { RAW: inEditableWorkspace(context.user.id) },
        id: {
          eq: id,
        },
      },
      with: { connection: { columns: { workspaceId: true } } },
    })

    if (!owned?.connection) {
      return
    }

    await db.delete(connectionsResources).where(eq(connectionsResources.id, id))

    await publishToWorkspace(publisher, owned.connection.workspaceId, {
      key: id,
      type: 'delete',
    })
  })
