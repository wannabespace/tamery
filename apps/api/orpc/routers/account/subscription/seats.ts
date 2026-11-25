import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { db } from '@tamery/db'
import { subscriptions, subscriptionSeats } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'
import normalizeEmail from 'validator/lib/normalizeEmail.js'

import { env } from '~/env'
import { redis } from '~/lib/redis'
import { sendEmail } from '~/lib/resend'
import {
  getAssignableSeats,
  getSubscription,
  OWNER_SEATS,
} from '~/lib/subscription'
import { accountMiddleware, orpc } from '~/orpc'

const DAY_MS = 24 * 60 * 60 * 1000

// Every assignment mails someone outside Tamery, from the Resend quota sign-in codes need; removing a seat refunds nothing.
const seatEmails = {
  byOwner: new RedisRateLimiter(redis, {
    maxRequests: 20,
    prefix: 'team-seat-email:owner:',
    window: DAY_MS,
  }),
  byRecipient: new RedisRateLimiter(redis, {
    maxRequests: 3,
    prefix: 'team-seat-email:recipient:',
    window: DAY_MS,
  }),
}

const getOwnTeam = async (userId: string) => {
  const subscription = await getSubscription(userId)

  return subscription?.userId === userId && subscription.plan === 'team'
    ? subscription
    : null
}

const list = orpc.use(accountMiddleware).handler(async ({ context }) => {
  const team = await getOwnTeam(context.user.id)

  if (!team) {
    return []
  }

  return db
    .select({ email: subscriptionSeats.email, id: subscriptionSeats.id })
    .from(subscriptionSeats)
    .where(eq(subscriptionSeats.subscriptionId, team.id))
    .orderBy(subscriptionSeats.id)
})

const add = orpc
  .use(accountMiddleware)
  .input(type({ email: 'string.trim |> string.lower |> string.email' }))
  .errors({
    BAD_REQUEST: { message: 'You already have a seat on your own plan.' },
    CONFLICT: {
      message: 'Every seat is taken. Add seats or remove someone first.',
    },
    NOT_FOUND: { message: 'You need a Team plan to assign seats.' },
    TOO_MANY_REQUESTS: {
      message: 'Too many seat emails today. Try again tomorrow.',
    },
  })
  .handler(async ({ context: { user }, errors, input: { email } }) => {
    const normalizedEmail = normalizeEmail(email) || email

    if (normalizedEmail === (normalizeEmail(user.email) || user.email)) {
      throw errors.BAD_REQUEST()
    }

    const team = await getOwnTeam(user.id)

    if (!team) {
      throw errors.NOT_FOUND()
    }

    const [byOwner, byRecipient] = await Promise.all([
      seatEmails.byOwner.limit(user.id),
      seatEmails.byRecipient.limit(normalizedEmail),
    ])

    if (!byOwner.success || !byRecipient.success) {
      throw errors.TOO_MANY_REQUESTS()
    }

    await db.transaction(async (tx) => {
      // Serializes assignments with each other and with the Stripe sync that lowers the seat count.
      const [locked] = await tx
        .select({
          plan: subscriptions.plan,
          seats: subscriptions.seats,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .where(eq(subscriptions.id, team.id))
        .for('update')

      const assigned = await tx
        .select({ normalizedEmail: subscriptionSeats.normalizedEmail })
        .from(subscriptionSeats)
        .where(eq(subscriptionSeats.subscriptionId, team.id))

      if (assigned.some((seat) => seat.normalizedEmail === normalizedEmail)) {
        return
      }

      if (!locked) {
        throw errors.NOT_FOUND()
      }

      if (locked.status === 'past_due' && locked.plan === 'team') {
        throw errors.CONFLICT({
          message: 'Update your payment method before assigning more seats.',
        })
      }

      const assignable = getAssignableSeats(locked)

      if (assigned.length >= assignable) {
        throw locked.status === 'trialing' &&
          assignable < locked.seats - OWNER_SEATS
          ? errors.CONFLICT({
              message:
                'During the trial you can give one seat. Add more once your plan is paid.',
            })
          : errors.CONFLICT()
      }

      await tx
        .insert(subscriptionSeats)
        .values({ email, normalizedEmail, subscriptionId: team.id })
    })

    const emailed = await sendEmail({
      props: { ownerEmail: user.email, url: `${env.MAIN_URL}/account/plan` },
      subject: 'You have a seat on a Tamery Team plan',
      template: 'TeamSeat',
      to: email,
    })

    return { emailed }
  })

const remove = orpc
  .use(accountMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input }) => {
    const team = await getOwnTeam(context.user.id)

    if (!team) {
      return
    }

    await db
      .delete(subscriptionSeats)
      .where(
        and(
          eq(subscriptionSeats.id, input.id),
          eq(subscriptionSeats.subscriptionId, team.id)
        )
      )
  })

export const seats = { add, list, remove }
