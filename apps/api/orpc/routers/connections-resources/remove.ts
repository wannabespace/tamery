import { db } from '@tamery/db'
import { connectionsResources } from '@tamery/db/schema'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'

import {
  getEditableResourceWorkspaceId,
  publishToWorkspace,
} from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input: { id } }) => {
    const workspaceId = await getEditableResourceWorkspaceId(
      context.user.id,
      id
    )

    if (!workspaceId) {
      return
    }

    await db.delete(connectionsResources).where(eq(connectionsResources.id, id))

    await publishToWorkspace(publisher, workspaceId, {
      key: id,
      type: 'delete',
    })
  })
