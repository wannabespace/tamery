import { beforeAll, beforeEach, expect, mock, test } from 'bun:test'
import process from 'node:process'

import { AiFeature } from '@tamery/ai/usage'
import { eq } from 'drizzle-orm'
import { Client } from 'pg'
import { v7 } from 'uuid'

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/tamery_test'

Object.assign(process.env, {
  DATABASE_URL,
  ENCRYPTION_SECRET: 'test-encryption-secret-of-32-chars',
  NODE_ENV: 'test',
  USER_KEY_SECRET: 'test-user-key-secret-of-32-chars',
})

let subscription: { periodStart: Date | null } | null = null
mock.module('~/modules/billing/subscription', () => ({
  getSubscription: () => Promise.resolve(subscription),
}))
const createIntent = mock(() =>
  Promise.resolve({ status: 'succeeded' } as { status: string })
)
mock.module('~/lib/stripe', () => ({
  getStripeCustomerId: () => Promise.resolve('cus_test'),
  stripe: { paymentIntents: { create: createIntent } },
}))
mock.module('~/lib/redis', () => ({ redis: {} }))

const database = new URL(DATABASE_URL)
const admin = new Client({
  connectionString: Object.assign(new URL(DATABASE_URL), {
    pathname: '/postgres',
  }).href,
})
await admin.connect()
const { rowCount } = await admin.query(
  'SELECT 1 FROM pg_database WHERE datname = $1',
  [database.pathname.slice(1)]
)
if (!rowCount) {
  await admin.query(`CREATE DATABASE "${database.pathname.slice(1)}"`)
}
await admin.end()

const { db } = await import('@tamery/db')
const { aiUsage, creditAccounts, users } = await import('@tamery/db/schema')
const { migrate } = await import('drizzle-orm/node-postgres/migrator')
const { credits } = await import('./credits')

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: new URL(
      '../../../../packages/db/migrations',
      import.meta.url
    ).pathname,
  })
})

let userId = ''

beforeEach(async () => {
  createIntent.mockClear()
  subscription = { periodStart: new Date(Date.now() - 60_000) }
  await db.execute('TRUNCATE users CASCADE')
  userId = v7()
  const email = `${userId}@tamery.test`
  await db
    .insert(users)
    .values({ email, id: userId, name: email, normalizedEmail: email })
})

const call = (cost: number, ownKey = false) =>
  credits.settle({
    cost,
    feature: AiFeature.Chat,
    model: 'test',
    ownKey,
    userId,
  })

const topUp = (
  paymentIntentId: string,
  amount: number,
  attemptId: string | null = null
) =>
  credits.credit({
    amount,
    attemptId,
    paymentIntentId,
    paymentMethodId: 'pm_card',
    userId,
  })

const account = async () => {
  const [row] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
  return row
}

const attempt = async () => {
  const row = await account()
  return row?.autoTopUpAttemptId
}

const balance = async () => {
  const state = await credits.get(userId)
  return state.balance
}

test('parallel calls past the budget each pay only their own overage', async () => {
  await topUp('pi_first', 1)
  await call(4.8)

  await Promise.all([call(0.15), call(0.15), call(0.15)])

  expect(await balance()).toBeCloseTo(0.75, 8)
})

test('without credits the overage becomes debt that refuses AI', async () => {
  await call(4.8)

  await Promise.all([call(0.15), call(0.15)])

  expect(await balance()).toBeCloseTo(-0.1, 8)
  expect(await credits.canUseAi(userId, subscription as never)).toBe(false)
})

test('a new period does not reopen the budget while the balance is debt', async () => {
  await call(5.5)
  subscription = { periodStart: new Date() }

  expect(await balance()).toBeCloseTo(-0.5, 8)
  expect(await credits.canUseAi(userId, subscription as never)).toBe(false)
})

test('Free usage and own-key calls spend no credits', async () => {
  await call(6, true)
  subscription = null
  await call(6)

  expect(await account()).toBeUndefined()
  expect(await db.$count(aiUsage, eq(aiUsage.userId, userId))).toBe(2)
  expect(await credits.canUseAi(userId, null)).toBe(false)
})

test('a payment intent credits once and covers debt', async () => {
  await call(5.5)

  await Promise.all([topUp('pi_manual', 10), topUp('pi_manual', 10)])

  expect(await balance()).toBeCloseTo(9.5, 8)
  expect(await credits.canUseAi(userId, subscription as never)).toBe(true)
})

test('a refund and a dispute take back each share once', async () => {
  await topUp('pi_refunded', 10)

  await credits.reverse('pi_refunded', 0.5)
  await credits.reverse('pi_refunded', 0.5)
  expect(await balance()).toBeCloseTo(5, 8)

  await credits.reverse('pi_refunded', 1)
  await credits.reverse('pi_refunded', 1)
  expect(await balance()).toBeCloseTo(0, 8)
})

test('a reversal before its top-up waits for it, and a won dispute gives back the rest', async () => {
  expect(await credits.reverse('pi_early', 1)).toBe(false)

  await topUp('pi_disputed', 10)
  await credits.reverse('pi_disputed', 0.25)
  await credits.reverse('pi_disputed', 1)
  expect(await balance()).toBeCloseTo(0, 8)

  expect(await credits.reverse('pi_disputed', 0.25, true)).toBe(true)
  expect(await balance()).toBeCloseTo(7.5, 8)
})

test('auto top-up charges one attempt at a time and only its own payment ends it', async () => {
  await topUp('pi_first', 6)
  await credits.setAutoTopUp(userId, {
    amount: 20,
    enabled: true,
    threshold: 5,
  })
  await call(5)

  await Promise.all([call(0.6), call(0.6), call(0.6)])

  expect(createIntent).toHaveBeenCalledTimes(1)
  const attemptId = (await attempt()) ?? null
  expect(attemptId).toBeTruthy()
  expect(createIntent.mock.calls[0]).toMatchObject([
    { amount: 2100, off_session: true, payment_method: 'pm_card' },
    { idempotencyKey: attemptId },
  ] as never)

  await topUp('pi_manual', 10)
  await call(0.1)
  expect(createIntent).toHaveBeenCalledTimes(1)
  expect(await attempt()).toBe(attemptId)

  await topUp('pi_automatic', 20, attemptId)
  expect(await attempt()).toBeNull()
  const { autoTopUp } = await credits.get(userId)
  expect(autoTopUp.enabled).toBe(true)
})

test('a declined auto top-up turns auto top-up off', async () => {
  await topUp('pi_first', 6)
  await credits.setAutoTopUp(userId, {
    amount: 20,
    enabled: true,
    threshold: 5,
  })
  createIntent.mockImplementationOnce(() =>
    Promise.reject(new Error('card_declined'))
  )

  await call(7)

  expect(createIntent).toHaveBeenCalledTimes(1)
  const { autoTopUp } = await credits.get(userId)
  expect(autoTopUp.enabled).toBe(false)
  expect(autoTopUp.failedAt).not.toBeNull()
})

test('auto top-up turns on only with a card from a top-up, and off without one', async () => {
  const settings = { amount: 20, threshold: 5 }

  expect(
    await credits.setAutoTopUp(userId, { ...settings, enabled: true })
  ).toBe(false)
  expect(
    await credits.setAutoTopUp(userId, { ...settings, enabled: false })
  ).toBe(true)
})
