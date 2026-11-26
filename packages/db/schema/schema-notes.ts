import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-orm/arktype'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { encryptedText } from '../utils'
import { users } from './auth'
import { connectionsResources } from './connections'

/** What the user knows about a database that its schema does not say. No schema and table is a note on the whole database, no column one on the table. */
export const schemaNotes = d.snakeCase.table(
  'schema_notes',
  {
    ...baseTable,
    column: d.text(),
    connectionResourceId: d
      .uuid()
      .references(() => connectionsResources.id, { onDelete: 'cascade' })
      .notNull(),
    note: encryptedText().notNull(),
    schema: d.text(),
    table: d.text(),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [d.index().on(t.connectionResourceId)]
)

export const schemaNotesSelectSchema = createSelectSchema(schemaNotes)
export const schemaNotesInsertSchema = createInsertSchema(schemaNotes)
export const schemaNotesUpdateSchema = createUpdateSchema(schemaNotes)
