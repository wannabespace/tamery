import type { AiKeyProvider } from '@tamery/shared/ai-key'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { encryptedText } from '../utils'
import { users } from './auth'

/** A user's own model provider keys, one per provider: while any is enabled, the AI chat runs on them on their bill. */
export const aiKeys = d.snakeCase.table(
  'ai_keys',
  {
    ...baseTable,
    enabled: d.boolean().default(true).notNull(),
    key: encryptedText().notNull(),
    provider: d.text().$type<AiKeyProvider>().notNull(),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [d.unique().on(t.userId, t.provider)]
)
