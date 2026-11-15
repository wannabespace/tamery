import type { AiKeyProvider } from '@tamery/shared/ai-key'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { encryptedText } from '../utils'
import { users } from './auth'

/** A user's own model provider key: while it is set, every AI call goes to that provider on their bill. */
export const aiKeys = d.snakeCase.table('ai_keys', {
  ...baseTable,
  key: encryptedText().notNull(),
  provider: d.text().$type<AiKeyProvider>().notNull(),
  userId: d
    .uuid()
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
})
