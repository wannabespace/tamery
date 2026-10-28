import * as d from 'drizzle-orm/pg-core'

import { env } from '../env'
import { encryptedTextColumn } from '../utils'
import { users } from './auth'

// Per-user key that encrypts the user's cloud connection strings. Stored wrapped by USER_KEY_SECRET (env), so a database dump alone cannot read it. Cascades on user delete into `deleted_records`, whose purge crypto-shreds the user's connection strings.
export const userEncryptionKeys = d.snakeCase.table('user_encryption_keys', {
  createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  secret: encryptedTextColumn(env.USER_KEY_SECRET)().notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  userId: d
    .uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
})
