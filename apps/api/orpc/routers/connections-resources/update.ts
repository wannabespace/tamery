import { db } from '@tamery/db'
import {
  connectionsResources,
  connectionsResourcesUpdateSchema,
} from '@tamery/db/schema'
import { eq } from 'drizzle-orm'

import {
  getEditableResourceWorkspaceId,
  publishToWorkspace,
} from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const update = orpc
  .use(authMiddleware)
  .input(
    connectionsResourcesUpdateSchema
      .omit('createdAt', 'updatedAt', 'id', 'connectionId')
      .merge(connectionsResourcesUpdateSchema.pick('id').required())
  )
  .errors({
    NOT_FOUND: { message: 'Connection resource not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const { id, ...changes } = input

    const workspaceId = await getEditableResourceWorkspaceId(
      context.user.id,
      id
    )

    if (!workspaceId) {
      throw errors.NOT_FOUND()
    }

    const [resource] = await db
      .update(connectionsResources)
      .set(changes)
      .where(eq(connectionsResources.id, id))
      .returning()

    if (!resource) {
      throw errors.NOT_FOUND({
        message: 'Connection resource not found after update',
      })
    }

    await publishToWorkspace(publisher, workspaceId, {
      type: 'update',
      value: resource,
    })
  })
