import { db } from '@tamery/db'
import {
  connections,
  connectionsResources,
  connectionsResourcesInsertSchema,
} from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'

import { inMemberWorkspace, publishToWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const create = orpc
  .use(authMiddleware)
  .input(connectionsResourcesInsertSchema)
  .errors({
    NOT_FOUND: { message: 'Connection not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const [connection] = await db
      .select({ workspaceId: connections.workspaceId })
      .from(connections)
      .where(
        and(
          eq(connections.id, input.connectionId),
          inMemberWorkspace(context.user.id)(connections)
        )
      )
      .limit(1)

    if (!connection) {
      throw errors.NOT_FOUND()
    }

    const [inserted] = await db
      .insert(connectionsResources)
      .values(input)
      .onConflictDoNothing()
      .returning()

    if (!inserted) {
      return db.query.connectionsResources.findFirst({
        where: {
          connectionId: { eq: input.connectionId },
          ...(input.name === null || input.name === undefined
            ? { id: { eq: input.id } }
            : { name: { eq: input.name } }),
        },
      })
    }

    await publishToWorkspace(publisher, connection.workspaceId, {
      type: 'insert',
      value: inserted,
    })
    return inserted
  })
