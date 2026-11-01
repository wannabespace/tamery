import * as d from 'drizzle-orm/pg-core'

import { env } from '../env'
import { encryptedColumn } from '../utils'
import { workspaces } from './auth'

// Per-workspace key that encrypts the workspace's cloud connection strings. Stored wrapped by USER_KEY_SECRET (env), so a database dump alone cannot read it. Cascades on workspace delete, crypto-shredding its connection strings. The table is owned by the tamery/main migrations against the shared database (20261031152301_workspace_sharing moved every owner's former user key onto their workspaces); this schema only mirrors it for type-safe queries.
export const workspaceEncryptionKeys = d.snakeCase.table('workspace_encryption_keys', {
  workspaceId: d
    .uuid()
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  secret: encryptedColumn(env.USER_KEY_SECRET)().notNull(),
  createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
