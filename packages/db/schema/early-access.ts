import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'

// Nothing reads it, but deleting it makes drizzle-kit generate drop the table and its email list.
export const earlyAccess = d.snakeCase.table('early_access', {
  ...baseTable,
  email: d.text().notNull().unique(),
  grantedAt: d.timestamp({ withTimezone: true }),
})
