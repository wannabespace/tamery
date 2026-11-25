import { db } from '@tamery/db'
import { subscriptions, subscriptionSeats } from '@tamery/db/schema'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@tamery/shared/constants'
import { type } from 'arktype'
import { and, eq, inArray } from 'drizzle-orm'

import { env } from '~/env'
import { sendEmail } from '~/lib/resend'
import { OWNER_SEATS, tamerySubscriptions } from '~/lib/subscription'
import { accountMiddleware, orpc } from '~/orpc'

const ownTeams = (userId: string) =>
  and(
    eq(subscriptions.userId, userId),
    eq(subscriptions.plan, 'team'),
    inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
    tamerySubscriptions
  )

const list = orpc
  .use(accountMiddleware)
  .handler(({ context }) =>
    db
      .select({ email: subscriptionSeats.email, id: subscriptionSeats.id })
      .from(subscriptionSeats)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, subscriptionSeats.subscriptionId)
      )
      .where(ownTeams(context.user.id))
      .orderBy(subscriptionSeats.id)
  )

const add = orpc
  .use(accountMiddleware)
  .input(type({ email: 'string.trim |> string.lower |> string.email' }))
  .errors({
    BAD_REQUEST: { message: 'You already have a seat on your own plan.' },
    CONFLICT: {
      message: 'Every seat is taken. Add seats or remove someone first.',
    },
    NOT_FOUND: { message: 'You need a Team plan to assign seats.' },
  })
  .handler(async ({ context: { user }, errors, input: { email } }) => {
    if (email === user.email) {
      throw errors.BAD_REQUEST()
    }

    const isNew = await db.transaction(async (tx) => {
      // Serializes assignments with each other and with the webhook that lowers the seat count.
      const [team] = await tx
        .select({ id: subscriptions.id, seats: subscriptions.seats })
        .from(subscriptions)
        .where(ownTeams(user.id))
        .limit(1)
        .for('update')

      if (!team) {
        throw errors.NOT_FOUND()
      }

      const assigned = await tx
        .select({ email: subscriptionSeats.email })
        .from(subscriptionSeats)
        .where(eq(subscriptionSeats.subscriptionId, team.id))

      if (assigned.some((seat) => seat.email === email)) {
        return false
      }

      if (assigned.length >= team.seats - OWNER_SEATS) {
        throw errors.CONFLICT()
      }

      await tx
        .insert(subscriptionSeats)
        .values({ email, subscriptionId: team.id })

      return true
    })

    if (isNew) {
      await sendEmail({
        props: { ownerName: user.name, url: `${env.MAIN_URL}/account` },
        subject: `${user.name} gave you Tamery Pro`,
        template: 'TeamSeat',
        to: email,
      })
    }
  })

const remove = orpc
  .use(accountMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input }) => {
    await db
      .delete(subscriptionSeats)
      .where(
        and(
          eq(subscriptionSeats.id, input.id),
          inArray(
            subscriptionSeats.subscriptionId,
            db
              .select({ id: subscriptions.id })
              .from(subscriptions)
              .where(ownTeams(context.user.id))
          )
        )
      )
  })

export const seats = { add, list, remove }
