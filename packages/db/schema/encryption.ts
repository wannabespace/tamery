import * as d from 'drizzle-orm/pg-core'

import { env } from '../env'
import { encryptedTextColumn } from '../utils'
import { workspaces } from './auth'

// Per-workspace key that encrypts the workspace's cloud connection strings, shared by every member. Stored wrapped by USER_KEY_SECRET (env), so a database dump alone cannot read it. Cascades on workspace delete: dropping the key crypto-shreds the workspace's connection strings.
export const workspaceEncryptionKeys = d.snakeCase.table(
  'workspace_encryption_keys',
  {
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    secret: encryptedTextColumn(env.USER_KEY_SECRET)().notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    workspaceId: d
      .uuid()
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  }
)
