import { CHAT_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import {
  aiUsage as aiUsageTable,
  creditAccounts,
  creditTopUps,
} from '@tamery/db/schema'
import { and, desc, eq, gt, sql, sum } from 'drizzle-orm'

import { redis } from '~/lib/redis'
import { getStripeCustomerId, stripe } from '~/lib/stripe'
import { getSubscription } from '~/lib/subscription'

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const AUTO_TOP_UP_LOCK_SECONDS = 10 * 60

/** Marks a payment intent as AI credits, so the webhook credits it and ignores every other payment. */
export const CREDITS_PAYMENT_KIND = 'ai_credits'

/** The included budget's month: since the paid period started, at most 30 days back, so a monthly plan renews with its payment and a yearly one rolls. */
const getIncludedSpent = async (userId: string) => {
  const subscription = await getSubscription(userId)
  const since = new Date(
    Math.max(subscription?.periodStart?.getTime() ?? 0, Date.now() - MONTH_MS)
  )
  const [spent] = await db
    .select({ cost: sum(aiUsageTable.cost).mapWith(Number) })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.userId, userId),
        eq(aiUsageTable.feature, AiFeature.Chat),
        gt(aiUsageTable.createdAt, since)
      )
    )
  return { since, spent: spent?.cost ?? 0 }
}

const getAccount = async (userId: string) => {
  const [account] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
  return account ?? null
}

type CreditAccount = typeof creditAccounts.$inferSelect

const turnOffAutoTopUp = (userId: string) =>
  db
    .update(creditAccounts)
    .set({ autoTopUpEnabled: false, autoTopUpFailedAt: new Date() })
    .where(eq(creditAccounts.userId, userId))

/** Charges the card the user paid with, off session; the webhook adds the credits once the payment succeeds. A payment that fails, or no card to charge, turns auto top-up off, so it never retries a declined card. */
const topUpAutomatically = async (account: CreditAccount) => {
  if (
    !(stripe && account.autoTopUpEnabled) ||
    account.balance >= account.autoTopUpThreshold
  ) {
    return
  }
  const locked = await redis.set(`credits:auto-top-up:${account.userId}`, '1', {
    EX: AUTO_TOP_UP_LOCK_SECONDS,
    NX: true,
  })
  if (!locked) {
    return
  }
  const customer = await getStripeCustomerId(stripe, account.userId)
  const cards = await stripe.paymentMethods.list({
    customer,
    limit: 1,
    type: 'card',
  })
  const [card] = cards.data
  if (!card) {
    await turnOffAutoTopUp(account.userId)
    return
  }
  await stripe.paymentIntents
    .create({
      amount: Math.round(account.autoTopUpAmount * 100),
      confirm: true,
      currency: 'usd',
      customer,
      description: 'Tamery AI credits (auto top-up)',
      metadata: {
        amount: String(account.autoTopUpAmount),
        automatic: 'true',
        kind: CREDITS_PAYMENT_KIND,
        userId: account.userId,
      },
      off_session: true,
      payment_method: card.id,
    })
    .catch(async (error: unknown) => {
      console.error(`auto top-up for ${account.userId} failed`, error)
      await turnOffAutoTopUp(account.userId)
    })
}

/** AI credits: Pro spends the month's included budget first, then the dollars it bought. */
export const credits = {
  /** Whether a chat turn may start: some included budget left, or credits. */
  canChat: async (userId: string) => {
    const [{ spent }, account] = await Promise.all([
      getIncludedSpent(userId),
      getAccount(userId),
    ])
    return spent < CHAT_LIMITS.monthlyCostUsd || (account?.balance ?? 0) > 0
  },
  /** Adds a paid top-up once, by its payment intent. */
  credit: async (topUp: {
    amount: number
    automatic: boolean
    paymentIntentId: string
    userId: string
  }) => {
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(creditTopUps)
        .values({
          amount: topUp.amount,
          automatic: topUp.automatic,
          stripePaymentIntentId: topUp.paymentIntentId,
          userId: topUp.userId,
        })
        .onConflictDoNothing()
        .returning({ id: creditTopUps.id })
      if (!inserted) {
        return
      }
      await tx
        .insert(creditAccounts)
        .values({ balance: topUp.amount, userId: topUp.userId })
        .onConflictDoUpdate({
          set: {
            balance: sql`${creditAccounts.balance} + ${topUp.amount}`,
            ...(topUp.automatic && { autoTopUpFailedAt: null }),
          },
          target: creditAccounts.userId,
        })
    })
    await redis.del(`credits:auto-top-up:${topUp.userId}`)
  },
  get: async (userId: string) => {
    const [{ since, spent }, account, topUps] = await Promise.all([
      getIncludedSpent(userId),
      getAccount(userId),
      db
        .select({
          amount: creditTopUps.amount,
          automatic: creditTopUps.automatic,
          createdAt: creditTopUps.createdAt,
          id: creditTopUps.id,
        })
        .from(creditTopUps)
        .where(eq(creditTopUps.userId, userId))
        .orderBy(desc(creditTopUps.createdAt))
        .limit(20),
    ])
    return {
      autoTopUp: {
        amount: account?.autoTopUpAmount ?? null,
        enabled: account?.autoTopUpEnabled ?? false,
        failedAt: account?.autoTopUpFailedAt ?? null,
        threshold: account?.autoTopUpThreshold ?? null,
      },
      balance: account?.balance ?? 0,
      included: {
        budget: CHAT_LIMITS.monthlyCostUsd,
        since,
        spent: Math.min(spent, CHAT_LIMITS.monthlyCostUsd),
      },
      topUps,
    }
  },
  setAutoTopUp: async (
    userId: string,
    settings: { amount: number; enabled: boolean; threshold: number }
  ) => {
    const values = {
      autoTopUpAmount: settings.amount,
      autoTopUpEnabled: settings.enabled,
      autoTopUpFailedAt: null,
      autoTopUpThreshold: settings.threshold,
    }
    const [account] = await db
      .insert(creditAccounts)
      .values({ ...values, userId })
      .onConflictDoUpdate({ set: values, target: creditAccounts.userId })
      .returning()
    if (account) {
      await topUpAutomatically(account)
    }
  },
  /** Takes what a chat call cost past the included budget out of the credits, then tops up if the balance fell under the threshold. The just-recorded call is already in the month's sum. */
  spend: async ({ cost, userId }: { cost: number; userId: string }) => {
    const { spent } = await getIncludedSpent(userId)
    const overage = Math.min(cost, spent - CHAT_LIMITS.monthlyCostUsd)
    if (overage <= 0) {
      return
    }
    const [account] = await db
      .update(creditAccounts)
      .set({ balance: sql`${creditAccounts.balance} - ${overage}` })
      .where(eq(creditAccounts.userId, userId))
      .returning()
    if (account) {
      await topUpAutomatically(account)
    }
  },
}
