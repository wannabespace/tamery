import type { SubscriptionPlan } from '@tamery/shared/permissions'
import * as d from 'drizzle-orm/pg-core'
import type Stripe from 'stripe'

import { baseTable } from '../base-table'
import { users } from './auth'

export type SubscriptionStatus = Extract<Stripe.Subscription.Status, string>

export const subscriptionPeriod = d.pgEnum('subscription_period', [
  'monthly',
  'yearly',
])

export const subscriptions = d.snakeCase.table(
  'subscriptions',
  {
    ...baseTable,
    cancelAt: d.timestamp({ withTimezone: true }),
    cancelAtPeriodEnd: d.boolean().default(false),
    period: subscriptionPeriod().notNull(),
    periodEnd: d.timestamp({ withTimezone: true }),
    periodStart: d.timestamp({ withTimezone: true }),
    plan: d.text().notNull().$type<SubscriptionPlan>(),
    price: d.numeric({ mode: 'number' }).notNull(),
    seats: d.integer().notNull().default(1),
    status: d.text().$type<SubscriptionStatus>().default('incomplete'),
    stripePriceId: d.text(),
    stripeSubscriptionId: d.text(),
    trialEnd: d.timestamp({ withTimezone: true }),
    trialStart: d.timestamp({ withTimezone: true }),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [d.index().on(t.userId)]
)

export const subscriptionSeats = d.snakeCase.table(
  'subscription_seats',
  {
    ...baseTable,
    email: d.text().notNull(),
    normalizedEmail: d.text().notNull(),
    subscriptionId: d
      .uuid()
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
  },
  (table) => [
    d.unique().on(table.subscriptionId, table.normalizedEmail),
    d.index().on(table.normalizedEmail),
  ]
)
