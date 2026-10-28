import { db } from '@tamery/db'
import {
  connections,
  connectionsResources,
  connectionsSelectSchema,
} from '@tamery/db/schema'
import { omit } from '@tamery/shared/utils'
import type { SQL } from 'drizzle-orm'
import { getColumns, inArray } from 'drizzle-orm'

import { publishToUsers } from '~/lib/workspace'
import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

import { publisher as resourcesPublisher } from '../connections-resources/events'

/** A device persists synced rows as-is, so the string reaches it only through `resolve`. */
export const syncedColumns = omit(getColumns(connections), ['connectionString'])

export const output = createSyncOutputSchema(
  connectionsSelectSchema.omit('connectionString')
)

export const publisher = createSyncPublisher(
  output,
  'orpc:publisher:connections:'
)
export const events = createEventsEndpoint(output, publisher)

export const publishConnections = async ({
  type,
  userIds,
  where,
}: {
  type: 'insert' | 'delete'
  userIds: string[]
  where: SQL
}) => {
  const rows = await db.select(syncedColumns).from(connections).where(where)

  const resources = await db
    .select()
    .from(connectionsResources)
    .where(
      inArray(
        connectionsResources.connectionId,
        rows.map((row) => row.id)
      )
    )

  await Promise.all([
    publishToUsers(
      publisher,
      userIds,
      rows.map((row) =>
        type === 'insert' ? { type, value: row } : { key: row.id, type }
      )
    ),
    publishToUsers(
      resourcesPublisher,
      userIds,
      resources.map((resource) =>
        type === 'insert'
          ? { type, value: resource }
          : { key: resource.id, type }
      )
    ),
  ])
}
