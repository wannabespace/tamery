import { ORPCError } from '@orpc/server'
import { db } from '@tamery/db'
import {
  aiUsage as aiUsageTable,
  creditAccounts,
  creditTopUps,
} from '@tamery/db/schema'
import {
  CREDIT_TOP_UP,
  PRO_INCLUDED_AI_USD,
  topUpChargeCents,
} from '@tamery/shared/credits'
import { and, desc, eq, gt, isNotNull, isNull, lt, sql, sum } from 'drizzle-orm'
import { v7 } from 'uuid'

import { redis } from '~/lib/redis'
import { getStripeCustomerId, stripe } from '~/lib/stripe'

import { getSubscription } from './subscription'

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/** A Tamery-paid call can spend up to a full context window before its usage settles, so a user runs only this many at once, chat turns and every other AI call together. */
const PAID_CALLS_AT_ONCE = 4
const PAID_CALL_MS = 15 * 60 * 1000

export const PAID_CALLS_BUSY_MESSAGE =
  'Tamery AI is already answering several of your requests. Try again once one of them finishes.'

const paidCallsKey = (userId: string) => `credits:paid-calls:${userId}`

/** Marks a payment intent as AI credits, so the webhook credits it and ignores every other payment. */
export const CREDITS_PAYMENT_KIND = 'ai_credits'

type Subscription = Awaited<ReturnType<typeof getSubscription>>

/** The included budget's month: since the paid period started, at most 30 days back, so a monthly plan renews with its payment and a yearly one rolls. */
const periodStart = (subscription: Subscription) =>
  new Date(
    Math.max(subscription?.periodStart?.getTime() ?? 0, Date.now() - MONTH_MS)
  )

const getIncludedSpent = async (
  tx: Pick<typeof db, 'select'>,
  userId: string,
  since: Date
) => {
  const [spent] = await tx
    .select({ cost: sum(aiUsageTable.cost).mapWith(Number) })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.userId, userId),
        eq(aiUsageTable.ownKey, false),
        gt(aiUsageTable.createdAt, since)
      )
    )
  return spent?.cost ?? 0
}

const getAccount = async (userId: string) => {
  const [account] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
  return account ?? null
}

const failAttempt = (userId: string, attemptId: string) =>
  db
    .update(creditAccounts)
    .set({
      autoTopUpAttemptId: null,
      autoTopUpEnabled: false,
      autoTopUpFailedAt: new Date(),
    })
    .where(
      and(
        eq(creditAccounts.userId, userId),
        eq(creditAccounts.autoTopUpAttemptId, attemptId)
      )
    )

/** Charges the card of the user's last top-up, off session, once the balance is under the threshold; the webhook adds the credits once the payment succeeds. One charge at a time per account, and one that fails turns auto top-up off, so it never retries a declined card. */
const topUpAutomatically = async (userId: string) => {
  const client = stripe
  if (!client) {
    return
  }
  const attemptId = v7()
  const [account] = await db
    .update(creditAccounts)
    .set({ autoTopUpAttemptId: attemptId })
    .where(
      and(
        eq(creditAccounts.userId, userId),
        eq(creditAccounts.autoTopUpEnabled, true),
        isNull(creditAccounts.autoTopUpAttemptId),
        isNotNull(creditAccounts.autoTopUpPaymentMethodId),
        lt(creditAccounts.balance, creditAccounts.autoTopUpThreshold)
      )
    )
    .returning()
  const paymentMethod = account?.autoTopUpPaymentMethodId
  if (!(account && paymentMethod)) {
    return
  }
  const charge = async () =>
    client.paymentIntents.create(
      {
        amount: topUpChargeCents(account.autoTopUpAmount),
        confirm: true,
        currency: 'usd',
        customer: await getStripeCustomerId(client, userId),
        description: `Tamery AI credits (auto top-up), including a ${CREDIT_TOP_UP.fee * 100}% fee`,
        metadata: {
          amount: String(account.autoTopUpAmount),
          attemptId,
          kind: CREDITS_PAYMENT_KIND,
          userId,
        },
        off_session: true,
        payment_method: paymentMethod,
      },
      { idempotencyKey: attemptId }
    )
  const intent = await charge().catch((error: unknown) => {
    console.error(`auto top-up for ${userId} failed`, {
      type: error instanceof Error ? error.name : typeof error,
    })
    return null
  })
  if (!(intent && ['processing', 'succeeded'].includes(intent.status))) {
    await failAttempt(userId, attemptId)
  }
}

/** AI credits: a plan spends its month's included budget first, then the dollars it bought. */
export const credits = {
  /** Whether Tamery may pay for an AI call: an active plan with no debt, and included budget or credits left. */
  canUseAi: async (userId: string, subscription: Subscription) => {
    if (!subscription) {
      return false
    }
    const [spent, account] = await Promise.all([
      getIncludedSpent(db, userId, periodStart(subscription)),
      getAccount(userId),
    ])
    const balance = account?.balance ?? 0
    return balance > 0 || (balance === 0 && spent < PRO_INCLUDED_AI_USD)
  },
  /** Adds a paid top-up once, by its payment intent. A manual top-up's card becomes the one auto top-up charges; an automatic one ends its attempt. */
  credit: (topUp: {
    amount: number
    attemptId: string | null
    paymentIntentId: string
    paymentMethodId: string | null
    userId: string
  }) =>
    db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(creditTopUps)
        .values({
          amount: topUp.amount,
          automatic: !!topUp.attemptId,
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
        .values({
          autoTopUpPaymentMethodId: topUp.paymentMethodId,
          balance: topUp.amount,
          userId: topUp.userId,
        })
        .onConflictDoUpdate({
          set: {
            balance: sql`${creditAccounts.balance} + ${topUp.amount}`,
            ...(topUp.attemptId
              ? {
                  autoTopUpAttemptId: sql`nullif(${creditAccounts.autoTopUpAttemptId}, ${topUp.attemptId}::uuid)`,
                  autoTopUpFailedAt: null,
                }
              : { autoTopUpPaymentMethodId: topUp.paymentMethodId }),
          },
          target: creditAccounts.userId,
        })
    }),
  /** An automatic top-up whose charge failed after it was created: auto top-up turns off. */
  failAutoTopUp: failAttempt,
  get: async (userId: string) => {
    const since = periodStart(await getSubscription(userId))
    const [spent, account, topUps] = await Promise.all([
      getIncludedSpent(db, userId, since),
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
        budget: PRO_INCLUDED_AI_USD,
        since,
        spent: Math.min(spent, PRO_INCLUDED_AI_USD),
      },
      topUps,
    }
  },
  /** Takes one of the Tamery-paid calls a user may run at once, under the call's own id; false when none is free. A slot never released expires after PAID_CALL_MS. */
  hold: async (userId: string, callId: string) => {
    const key = paidCallsKey(userId)
    const now = Date.now()
    const replies = await redis
      .multi()
      .zRemRangeByScore(key, '-inf', now)
      .zAdd(key, { score: now + PAID_CALL_MS, value: callId })
      .zCard(key)
      .pExpire(key, PAID_CALL_MS)
      .exec()
    if (Number(replies[2]) <= PAID_CALLS_AT_ONCE) {
      return true
    }
    await redis.zRem(key, callId)
    return false
  },
  release: (userId: string, callId: string) =>
    redis.zRem(paidCallsKey(userId), callId),
  /** Runs a Tamery-paid call in one of the user's slots for as long as `run` takes; `TOO_MANY_REQUESTS` when none is free. */
  inPaidSlot: async <T>(userId: string, run: () => Promise<T>) => {
    const callId = v7()
    if (!(await credits.hold(userId, callId))) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: PAID_CALLS_BUSY_MESSAGE,
      })
    }
    try {
      return await run()
    } finally {
      await credits.release(userId, callId)
    }
  },
  /** Sets the share of a top-up a refund or dispute took back, once however often Stripe repeats the event: a refund or an opened dispute only raises it, a won dispute lowers it back to what was refunded. The balance may go below zero. False when no top-up has that payment intent yet. */
  reverse: (paymentIntentId: string, share: number, won = false) =>
    db.transaction(async (tx) => {
      const [topUp] = await tx
        .select()
        .from(creditTopUps)
        .where(eq(creditTopUps.stripePaymentIntentId, paymentIntentId))
        .for('update')
      if (!topUp) {
        return false
      }
      const target = topUp.amount * Math.min(share, 1)
      const reversed = won ? target : Math.max(target, topUp.reversed)
      const taken = reversed - topUp.reversed
      if (taken === 0) {
        return true
      }
      await tx
        .update(creditTopUps)
        .set({ reversed })
        .where(eq(creditTopUps.id, topUp.id))
      await tx
        .update(creditAccounts)
        .set({ balance: sql`${creditAccounts.balance} - ${taken}` })
        .where(eq(creditAccounts.userId, topUp.userId))
      return true
    }),
  /** Auto top-up charges the card of a top-up, so turning it on before any top-up saves nothing and answers false. */
  setAutoTopUp: async (
    userId: string,
    settings: { amount: number; enabled: boolean; threshold: number }
  ) => {
    const account = await getAccount(userId)
    if (settings.enabled && !account?.autoTopUpPaymentMethodId) {
      return false
    }
    const values = {
      autoTopUpAmount: settings.amount,
      autoTopUpEnabled: settings.enabled,
      autoTopUpFailedAt: null,
      autoTopUpThreshold: settings.threshold,
    }
    await db
      .insert(creditAccounts)
      .values({ ...values, userId })
      .onConflictDoUpdate({ set: values, target: creditAccounts.userId })
    await topUpAutomatically(userId)
    return true
  },
  /** Records an AI call. A plan's Tamery-paid call also takes what it cost past the included budget out of the credits, in one transaction locked on the account, so parallel calls settle one after another and each pays only the overage it adds; without credits the balance goes below zero. Free usage is Tamery's own and spends nothing. */
  settle: async (usage: typeof aiUsageTable.$inferInsert) => {
    const { cost, userId } = usage
    const subscription =
      cost && !usage.ownKey ? await getSubscription(userId) : null
    if (!(cost && subscription)) {
      await db.insert(aiUsageTable).values(usage)
      return
    }
    const debited = await db.transaction(async (tx) => {
      await tx.insert(creditAccounts).values({ userId }).onConflictDoNothing()
      await tx
        .select({ id: creditAccounts.id })
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, userId))
        .for('update')
      const before = await getIncludedSpent(
        tx,
        userId,
        periodStart(subscription)
      )
      await tx.insert(aiUsageTable).values(usage)
      const overage =
        Math.max(0, before + cost - PRO_INCLUDED_AI_USD) -
        Math.max(0, before - PRO_INCLUDED_AI_USD)
      if (overage <= 0) {
        return false
      }
      await tx
        .update(creditAccounts)
        .set({ balance: sql`${creditAccounts.balance} - ${overage}` })
        .where(eq(creditAccounts.userId, userId))
      return true
    })
    if (debited) {
      await topUpAutomatically(userId)
    }
  },
}
