import { db } from '@tamery/db'
import { machines } from '@tamery/db/schema'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'

import { accountMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

/** Called by a machine when it starts and while it runs, so `seenAt` tells another device whether it is up. */
export const register = orpc
  .use(accountMiddleware)
  .input(
    type({
      id: 'string.uuid.v7',
      name: '0 < string <= 100',
      urls: 'string.url[] <= 4',
    })
  )
  .errors({
    CONFLICT: { message: 'This machine is registered to another account.' },
  })
  .handler(async ({ context, errors, input }) => {
    const seenAt = new Date()
    const [row] = await db
      .insert(machines)
      .values({ ...input, seenAt, userId: context.user.id })
      .onConflictDoUpdate({
        set: { name: input.name, seenAt, updatedAt: seenAt, urls: input.urls },
        setWhere: eq(machines.userId, context.user.id),
        target: machines.id,
      })
      .returning()

    if (!row) {
      throw errors.CONFLICT()
    }

    await publisher.publish(context.user.id, {
      type:
        row.createdAt.getTime() === row.updatedAt.getTime()
          ? 'insert'
          : 'update',
      value: row,
    })
  })
