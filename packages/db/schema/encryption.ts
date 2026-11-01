import * as d from 'drizzle-orm/pg-core'

import { env } from '../env'
import { encryptedTextColumn } from '../utils'
import { workspaces } from './auth'

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
