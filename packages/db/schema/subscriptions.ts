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
    plan: d.text().notNull().$type<'pro'>(),
    price: d.numeric({ mode: 'number' }).notNull(),
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
