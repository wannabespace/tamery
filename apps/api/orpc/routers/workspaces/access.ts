import { ORPCError } from '@orpc/server'
import { db } from '@tamery/db'
import {
  connections,
  connectionsResources,
  workspaces,
} from '@tamery/db/schema'
import { isAPIError } from 'better-auth/api'
import type { SQL } from 'drizzle-orm'
import { eq, getColumns, inArray } from 'drizzle-orm'

import { publisher as resourcesPublisher } from '../connections-resources/events'
import {
  publisher as connectionsPublisher,
  syncedColumns,
} from '../connections/events'
import { publisher } from './events'
import { workspaceRows } from './sync'

export const publishConnections = async ({
  type,
  userIds,
  where,
}: {
  type: 'insert' | 'delete'
  userIds: string[]
  where: SQL | undefined
}) => {
  const rows = await db.select(syncedColumns).from(connections).where(where)
  const resources =
    rows.length > 0
      ? await db
          .select(getColumns(connectionsResources))
          .from(connectionsResources)
          .where(
            inArray(
              connectionsResources.connectionId,
              rows.map((row) => row.id)
            )
          )
      : []

  await Promise.all(
    userIds.flatMap((userId) => [
      ...rows.map((row) =>
        connectionsPublisher.publish(
          userId,
          type === 'insert' ? { type, value: row } : { key: row.id, type }
        )
      ),
      ...resources.map((resource) =>
        resourcesPublisher.publish(
          userId,
          type === 'insert'
            ? { type, value: resource }
            : { key: resource.id, type }
        )
      ),
    ])
  )
}

export const publishMembership = async (
  userId: string,
  workspaceId: string
) => {
  const [row] = await workspaceRows(userId, eq(workspaces.id, workspaceId))

  if (!row) {
    await publishConnections({
      type: 'delete',
      userIds: [userId],
      where: eq(connections.workspaceId, workspaceId),
    })
    await publisher.publish(userId, { key: workspaceId, type: 'delete' })
    return
  }

  await publisher.publish(userId, { type: 'insert', value: row })
  await publishConnections({
    type: 'insert',
    userIds: [userId],
    where: eq(connections.workspaceId, workspaceId),
  })
}

export const viaAuth = async <T>(promise: Promise<T>) => {
  try {
    return await promise
  } catch (error) {
    if (isAPIError(error)) {
      throw new ORPCError(String(error.status), { message: error.message })
    }
    throw error
  }
}
