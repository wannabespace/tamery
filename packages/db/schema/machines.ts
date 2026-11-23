import { createInsertSchema, createSelectSchema } from 'drizzle-orm/arktype'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { users } from './auth'
import { connections } from './connections'

export const machines = d.snakeCase.table(
  'machines',
  {
    ...baseTable,
    name: d.text().notNull(),
    seenAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    urls: d.text().array().notNull(),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [d.index().on(t.userId)]
)

export const machinesSelectSchema = createSelectSchema(machines)

/** Per user: a teammate's choice never sends a workspace connection through another member's machine. */
export const connectionMachines = d.snakeCase.table(
  'connection_machines',
  {
    ...baseTable,
    connectionId: d
      .uuid()
      .references(() => connections.id, { onDelete: 'cascade' })
      .notNull(),
    machineId: d
      .uuid()
      .references(() => machines.id, { onDelete: 'cascade' })
      .notNull(),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [d.unique().on(t.userId, t.connectionId)]
)

export const connectionMachinesSelectSchema =
  createSelectSchema(connectionMachines)
export const connectionMachinesInsertSchema =
  createInsertSchema(connectionMachines)
