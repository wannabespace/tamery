import type { MachineId } from '@tamery/shared/machine'
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

/**
 * Per user: a teammate's choice never sends a workspace connection through another member's machine. A row with no machine is
 * Tamery Cloud, which the desktop app must be told, since its own default is its computer.
 */
export const connectionMachines = d.snakeCase.table(
  'connection_machines',
  {
    ...baseTable,
    connectionId: d
      .uuid()
      .references(() => connections.id, { onDelete: 'cascade' })
      .notNull(),
    machineId: d.uuid().$type<MachineId>(),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [d.unique().on(t.userId, t.connectionId), d.index().on(t.connectionId)]
)

export const connectionMachinesSelectSchema =
  createSelectSchema(connectionMachines)
export const connectionMachinesInsertSchema =
  createInsertSchema(connectionMachines)
