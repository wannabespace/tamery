import { AiFeature } from '@tamery/ai/usage'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { users, workspaces } from './auth'
import { chats } from './chats'

export const aiFeature = d.pgEnum('ai_feature', AiFeature)

export const aiUsage = d.snakeCase.table(
  'ai_usage',
  {
    ...baseTable,
    cacheReadTokens: d.integer().notNull().default(0),
    cacheWriteTokens: d.integer().notNull().default(0),
    chatId: d.uuid().references(() => chats.id, { onDelete: 'set null' }),
    cost: d.numeric({ mode: 'number', precision: 12, scale: 8 }),
    feature: aiFeature().notNull(),
    inputTokens: d.integer().notNull().default(0),
    model: d.text().notNull(),
    outputTokens: d.integer().notNull().default(0),
    /** Paid by the user's own provider key: shown in AI usage, never counted toward the budget or spent from credits. */
    ownKey: d.boolean().notNull().default(false),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: d
      .uuid()
      .references(() => workspaces.id, { onDelete: 'set null' }),
  },
  (t) => [
    d.index().on(t.userId, t.createdAt),
    d.index().on(t.chatId),
    d.index().on(t.workspaceId),
  ]
)
