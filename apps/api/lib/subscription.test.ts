import { beforeAll, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import process from 'node:process'

import { call, os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { Client } from 'pg'
import { v7 } from 'uuid'

import type { Context } from '~/orpc/context'

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/tamery_test'

Object.assign(process.env, {
  DATABASE_URL,
  ENCRYPTION_SECRET: 'test-encryption-secret-of-32-chars',
  NODE_ENV: 'test',
  USER_KEY_SECRET: 'test-user-key-secret-of-32-chars',
})

const PRICES = {
  pro: 'price_pro_month',
  team: 'price_team_month',
}

mock.module('~/env', () => ({
  env: {
    MAIN_URL: 'https://tamery.test',
    STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_annual',
    STRIPE_PRO_MONTH_PRICE_ID: PRICES.pro,
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_TEAM_ANNUAL_PRICE_ID: 'price_team_annual',
    STRIPE_TEAM_MONTH_PRICE_ID: PRICES.team,
  },
}))
const redisClient = {
  connect: () => Promise.resolve(),
  duplicate: () => redisClient,
  on: () => redisClient,
}
mock.module('redis', () => ({ createClient: () => redisClient }))
const limit = mock(() => Promise.resolve({ success: true }))
mock.module('@orpc/ratelimit/redis', () => ({
  RedisRateLimiter: mock(() => ({ limit })),
}))
const sendEmail = mock(() => Promise.resolve(true))
mock.module('~/lib/resend', () => ({ sendEmail }))

let signedIn = { email: '', id: '' }
const orpc = os.$context<Context>()
const asSignedIn = orpc.middleware(({ next }) =>
  next({ context: { user: signedIn } })
)
mock.module('~/orpc', () => ({
  accountMiddleware: asSignedIn,
  authMiddleware: asSignedIn,
  orpc,
}))

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
const { subscriptions, subscriptionSeats, users } =
  await import('@tamery/db/schema')
const { migrate } = await import('drizzle-orm/node-postgres/migrator')
const { stripe } = await import('~/lib/stripe')
const { getSubscription, syncSubscription } = await import('~/lib/subscription')
const { seats } = await import('~/orpc/routers/account/subscription/seats')
const { list } = await import('~/orpc/routers/account/subscription/list')
const { upgrade } = await import('~/orpc/routers/account/subscription/upgrade')

if (!stripe) {
  throw new Error('Stripe is not configured')
}

const retrieve = spyOn(stripe.subscriptions, 'retrieve')
const cancel = spyOn(stripe.subscriptions, 'cancel')
const createCustomer = spyOn(stripe.customers, 'create')
const createCheckout = spyOn(stripe.checkout.sessions, 'create')

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: new URL(
      '../../../packages/db/migrations',
      import.meta.url
    ).pathname,
  })
})

beforeEach(async () => {
  createCustomer.mockReset()
  createCheckout.mockReset()
  retrieve.mockReset()
  cancel.mockReset()
  limit.mockClear()
  sendEmail.mockClear()
  await db.execute('TRUNCATE users, subscriptions CASCADE')
})

const context: Context = {
  addLogData: mock(),
  clientId: undefined,
  headers: new Headers(),
  isAppOutdated: false,
  isDesktop: false,
  parsedAppVersion: null,
  request: new Request('https://api.tamery.test/rpc'),
  setHeader: mock(),
  userAgent: null,
}

const createUser = async (
  email: string,
  { emailVerified = true, normalizedEmail = email } = {}
) => {
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified, id: v7(), name: email, normalizedEmail })
    .returning({ email: users.email, id: users.id })

  if (!user) {
    throw new Error('User not created')
  }

  return user
}

const stripeSubscription = ({
  cancelAtPeriodEnd = false,
  price = PRICES.team,
  quantity,
  status,
  userId,
}: {
  cancelAtPeriodEnd?: boolean
  price?: string
  quantity: number
  status: string
  userId: string
}) =>
  // A wire fixture: only the fields the sync reads.
  ({
    cancel_at: null,
    cancel_at_period_end: cancelAtPeriodEnd,
    customer: 'cus_test',
    id: 'sub_test',
    items: {
      data: [
        {
          current_period_end: 1_800_000_000,
          current_period_start: 1_790_000_000,
          price: {
            id: price,
            recurring: { interval: 'month' },
            unit_amount: 2000,
          },
          quantity,
        },
      ],
    },
    metadata: { userId },
    status,
    trial_end: null,
    trial_start: null,
  }) as never

const createTeam = async ({
  quantity,
  status = 'active',
}: {
  quantity: number
  status?: string
}) => {
  const owner = await createUser('owner@tamery.test')
  retrieve.mockResolvedValue(
    stripeSubscription({ quantity, status, userId: owner.id })
  )
  await syncSubscription('sub_test')

  return owner
}

const assign = (owner: { email: string; id: string }, email: string) => {
  signedIn = owner
  return call(seats.add, { email }, { context })
}

const assignedEmails = async () => {
  const rows = await db
    .select({ email: subscriptionSeats.email })
    .from(subscriptionSeats)
    .orderBy(subscriptionSeats.id)

  return rows.map(({ email }) => email)
}

test('a seat gives Pro to the verified account its normalized email names', async () => {
  const owner = await createTeam({ quantity: 3 })
  const holder = await createUser('janedoe@gmail.com')
  const unverified = await createUser('bob@tamery.test', {
    emailVerified: false,
  })

  await assign(owner, 'Jane.Doe+work@gmail.com')
  await assign(owner, 'bob@tamery.test')

  expect(await getSubscription(holder.id)).toMatchObject({
    plan: 'team',
    userId: owner.id,
  })
  expect(await getSubscription(unverified.id)).toBeNull()
})

test('a seat holder sees the plan and none of the payer billing', async () => {
  const owner = await createTeam({ quantity: 2 })
  const holder = await createUser('holder@tamery.test')
  await assign(owner, holder.email)

  signedIn = holder
  expect(await call(list, undefined, { context })).toEqual([
    { isOwner: false, plan: 'team', status: 'active' },
  ])
})

test('the last seat goes to one of two concurrent assignments', async () => {
  const owner = await createTeam({ quantity: 3 })
  await assign(owner, 'first@tamery.test')

  const results = await Promise.allSettled([
    assign(owner, 'second@tamery.test'),
    assign(owner, 'third@tamery.test'),
  ])

  expect(results.map(({ status }) => status).toSorted()).toEqual([
    'fulfilled',
    'rejected',
  ])
  expect(await assignedEmails()).toHaveLength(2)
})

test('an email that already has a seat, or a full Team, sends no email and spends no email quota', async () => {
  const owner = await createTeam({ quantity: 2 })
  await assign(owner, 'jane@tamery.test')

  expect(await assign(owner, 'Jane@tamery.test')).toEqual({
    alreadyAssigned: true,
    emailed: false,
  })
  await expect(assign(owner, 'bob@tamery.test')).rejects.toThrow(
    'Every seat is taken'
  )
  expect(limit).toHaveBeenCalledTimes(2)
  expect(sendEmail).toHaveBeenCalledTimes(1)
})

test('a trial gives one seat besides the owner whatever count it will bill', async () => {
  const owner = await createTeam({ quantity: 5, status: 'trialing' })

  await assign(owner, 'first@tamery.test')

  await expect(assign(owner, 'second@tamery.test')).rejects.toThrow(
    'During the trial'
  )
  expect(await assignedEmails()).toEqual(['first@tamery.test'])
})

test('new Team seats wait for payment while existing seats stay assigned', async () => {
  const owner = await createTeam({ quantity: 4, status: 'trialing' })
  const holder = await createUser('holder@tamery.test')
  await assign(owner, holder.email)

  retrieve.mockResolvedValue(
    stripeSubscription({ quantity: 4, status: 'past_due', userId: owner.id })
  )
  await syncSubscription('sub_test')

  expect(await getSubscription(holder.id)).toMatchObject({ plan: 'team' })
  await expect(assign(owner, 'next@tamery.test')).rejects.toThrow(
    'Update your payment method'
  )
  expect(await assignedEmails()).toEqual([holder.email])

  retrieve.mockResolvedValue(
    stripeSubscription({ quantity: 4, status: 'active', userId: owner.id })
  )
  await syncSubscription('sub_test')

  await assign(owner, 'next@tamery.test')
  expect(await assignedEmails()).toEqual([holder.email, 'next@tamery.test'])
})

test("an owner cannot remove another team's seat", async () => {
  const owner = await createTeam({ quantity: 2 })
  await assign(owner, 'holder@tamery.test')
  const [seat] = await db
    .select({ id: subscriptionSeats.id })
    .from(subscriptionSeats)
  const stranger = await createUser('stranger@tamery.test')

  signedIn = stranger
  await call(seats.remove, { id: seat?.id ?? '' }, { context })

  expect(await assignedEmails()).toEqual(['holder@tamery.test'])
})

test('a lower seat count in Stripe drops the newest seats', async () => {
  const owner = await createTeam({ quantity: 4 })
  await assign(owner, 'a@tamery.test')
  await assign(owner, 'b@tamery.test')
  await assign(owner, 'c@tamery.test')

  retrieve.mockResolvedValue(
    stripeSubscription({ quantity: 2, status: 'active', userId: owner.id })
  )
  await syncSubscription('sub_test')

  expect(await assignedEmails()).toEqual(['a@tamery.test'])
})

test.each([
  ['moves to Pro', { price: PRICES.pro, status: 'active' }],
  ['is cancelled', { price: PRICES.team, status: 'canceled' }],
])('a Team that %s drops every seat', async (_, change) => {
  const owner = await createTeam({ quantity: 3 })
  const holder = await createUser('holder@tamery.test')
  await assign(owner, holder.email)

  retrieve.mockResolvedValue(
    stripeSubscription({ ...change, quantity: 1, userId: owner.id })
  )
  await syncSubscription('sub_test')

  expect(await assignedEmails()).toEqual([])
  expect(await getSubscription(holder.id)).toBeNull()
})

test('overlapping deliveries store the state Stripe returned last', async () => {
  const owner = await createUser('owner@tamery.test')
  retrieve
    .mockImplementationOnce(async () => {
      await Bun.sleep(100)
      return stripeSubscription({
        quantity: 5,
        status: 'active',
        userId: owner.id,
      })
    })
    .mockResolvedValueOnce(
      stripeSubscription({ quantity: 2, status: 'active', userId: owner.id })
    )

  const older = syncSubscription('sub_test')
  await Bun.sleep(20)
  await Promise.all([older, syncSubscription('sub_test')])

  const rows = await db
    .select({ seats: subscriptions.seats })
    .from(subscriptions)
  expect(rows).toEqual([{ seats: 2 }])
})

test('a sync waiting on another sync of the same subscription gives up with a retryable error', async () => {
  const owner = await createUser('owner@tamery.test')
  const { promise: stripeAnswer, resolve } = Promise.withResolvers<never>()
  const { promise: lockHeld, resolve: holdLock } =
    Promise.withResolvers<undefined>()
  retrieve.mockImplementationOnce(() => {
    holdLock(undefined)
    return stripeAnswer
  })

  const first = syncSubscription('sub_test')
  await lockHeld

  await expect(syncSubscription('sub_test')).rejects.toThrow(
    'Stripe retries the event'
  )
  resolve(
    stripeSubscription({ quantity: 1, status: 'active', userId: owner.id })
  )
  await first
  expect(await db.select().from(subscriptions)).toHaveLength(1)
}, 10_000)

test('a Stripe read that times out during a sync answers a retryable error', async () => {
  retrieve.mockRejectedValue(
    new stripe.errors.StripeConnectionError({
      message: 'Request aborted due to timeout being reached (15000ms)',
    })
  )

  await expect(syncSubscription('sub_test')).rejects.toThrow(
    'Stripe retries the event'
  )
})

test.each([
  ['has ended', { status: 'canceled' }, false],
  ['is set to cancel', { cancelAtPeriodEnd: true, status: 'active' }, false],
  ['still bills', { status: 'active' }, true],
])(
  'an event for a subscription that %s after its owner deleted the account stores nothing and cancels only a live one',
  async (_, change, cancels) => {
    const owner = await createUser('owner@tamery.test')
    await db.delete(users).where(eq(users.id, owner.id))
    retrieve.mockResolvedValue(
      stripeSubscription({ ...change, quantity: 1, userId: owner.id })
    )
    cancel.mockResolvedValue({} as never)

    await syncSubscription('sub_test')

    expect(cancel.mock.calls.map(([id]) => id)).toEqual(
      cancels ? ['sub_test'] : []
    )
    expect(await db.select().from(subscriptions)).toEqual([])
  }
)

const startCheckout = (user: { email: string; id: string }) => {
  signedIn = user
  return call(
    upgrade,
    {
      cancelUrl: 'https://tamery.test/account',
      returnUrl: 'https://tamery.test/account',
      successUrl: 'https://tamery.test/account',
    },
    { context }
  )
}

test('a checkout waiting on another one for the account gives up with a retryable error', async () => {
  const buyer = await createUser('buyer@tamery.test')
  const { promise: stripeAnswer, resolve } = Promise.withResolvers<never>()
  createCustomer.mockResolvedValue({ id: 'cus_test' } as never)
  const { promise: lockHeld, resolve: holdLock } =
    Promise.withResolvers<undefined>()
  createCheckout.mockImplementationOnce(() => {
    holdLock(undefined)
    return stripeAnswer
  })

  const first = startCheckout(buyer)
  await lockHeld

  await expect(startCheckout(buyer)).rejects.toMatchObject({
    code: 'GATEWAY_TIMEOUT',
  })
  resolve({ url: 'https://checkout.stripe.test' } as never)
  expect(await first).toEqual({ url: 'https://checkout.stripe.test' })
}, 10_000)

test('a Stripe call that times out under the lock answers a retryable error', async () => {
  const buyer = await createUser('buyer@tamery.test')
  createCustomer.mockRejectedValue(
    new stripe.errors.StripeConnectionError({
      message: 'Request aborted due to timeout being reached (15000ms)',
    })
  )

  await expect(startCheckout(buyer)).rejects.toMatchObject({
    code: 'GATEWAY_TIMEOUT',
  })
})
