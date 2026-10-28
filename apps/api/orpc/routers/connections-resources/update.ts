import { db } from '@tamery/db'
import {
  connections,
  connectionsResources,
  connectionsResourcesUpdateSchema,
} from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'

import { inEditableWorkspace, publishToWorkspace } from '~/lib/workspace'
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

    const [found] = await db
      .select({ workspaceId: connections.workspaceId })
      .from(connectionsResources)
      .innerJoin(
        connections,
        eq(connections.id, connectionsResources.connectionId)
      )
      .where(
        and(
          eq(connectionsResources.id, input.id),
          inEditableWorkspace(context.user.id)(connections)
        )
      )

    if (!found) {
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

    await publishToWorkspace(publisher, found.workspaceId, {
      type: 'update',
      value: resource,
    })
  })
