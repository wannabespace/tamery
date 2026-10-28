import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { defineRelationsPart } from 'drizzle-orm'
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-orm/arktype'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { encryptedText } from '../utils'
import { users, workspaces } from './auth'

export const connectionType = d.pgEnum('connection_type', ConnectionType)

export const syncType = d.pgEnum('sync_type', SyncType)

export const provider = d.pgEnum('provider', Provider)

export const connections = d.snakeCase.table(
  'connections',
  {
    ...baseTable,
    color: d.text(),
    connectionString: encryptedText(),
    isPasswordExists: d.boolean('password_exists').notNull(),
    label: d.text(),
    name: d.text().notNull(),
    provider: provider(),
    syncType: syncType().notNull(),
    type: connectionType().notNull(),
    userId: d.uuid().references(() => users.id, { onDelete: 'set null' }),
    workspaceId: d
      .uuid()
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [d.index('connections_workspaceId_idx').on(t.workspaceId)]
)

export const connectionsSelectSchema = createSelectSchema(connections)
export const connectionsUpdateSchema = createUpdateSchema(connections)
export const connectionsInsertSchema = createInsertSchema(connections)

export const connectionsResources = d.snakeCase.table(
  'connections_resources',
  {
    ...baseTable,
    connectionId: d
      .uuid()
      .references(() => connections.id, { onDelete: 'cascade' })
      .notNull(),
    name: d.text(),
  },
  (t) => [d.unique().on(t.connectionId, t.name)]
)

export const connectionsResourcesSelectSchema =
  createSelectSchema(connectionsResources)
export const connectionsResourcesUpdateSchema =
  createUpdateSchema(connectionsResources)
export const connectionsResourcesInsertSchema =
  createInsertSchema(connectionsResources)

export const connectionsRelations = defineRelationsPart(
  { connections, connectionsResources, users },
  (r) => ({
    connections: {
      resources: r.many.connectionsResources({
        from: r.connections.id,
        to: r.connectionsResources.connectionId,
      }),
      user: r.one.users({
        from: r.connections.userId,
        to: r.users.id,
      }),
    },
    connectionsResources: {
      connection: r.one.connections({
        from: r.connectionsResources.connectionId,
        to: r.connections.id,
      }),
    },
  })
)
