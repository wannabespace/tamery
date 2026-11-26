import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { users } from './auth'

/** A Pro user's bought AI credits in US dollars, spent once the month's included budget is gone, and their auto top-up. */
export const creditAccounts = d.snakeCase.table('credit_accounts', {
  ...baseTable,
  autoTopUpAmount: d.numeric({ mode: 'number' }).notNull().default(20),
  autoTopUpEnabled: d.boolean().notNull().default(false),
  autoTopUpFailedAt: d.timestamp({ withTimezone: true }),
  autoTopUpThreshold: d.numeric({ mode: 'number' }).notNull().default(5),
  balance: d
    .numeric({ mode: 'number', precision: 14, scale: 8 })
    .notNull()
    .default(0),
  userId: d
    .uuid()
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
})

/** One paid top-up; its payment intent id is unique, so a replayed webhook credits nothing twice. */
export const creditTopUps = d.snakeCase.table(
  'credit_top_ups',
  {
    ...baseTable,
    amount: d.numeric({ mode: 'number' }).notNull(),
    automatic: d.boolean().notNull(),
    stripePaymentIntentId: d.text().notNull().unique(),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [d.index().on(t.userId, t.createdAt)]
)
