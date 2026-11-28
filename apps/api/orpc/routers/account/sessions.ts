import { db } from '@tamery/db'
import { sessions as sessionsTable } from '@tamery/db/schema'
import { and, eq, gt } from 'drizzle-orm'

import { sessionActivity } from '~/lib/session-activity'
import { authMiddleware, orpc } from '~/orpc'

// better-auth's /list-sessions demands a session younger than freshAge, so a day-old sign-in lists nothing.
export const sessions = orpc
  .use(authMiddleware)
  .handler(async ({ context }) => {
    const rows = await db
      .select({
        current: eq(sessionsTable.id, context.session.id).mapWith(Boolean),
        id: sessionsTable.id,
        ipAddress: sessionsTable.ipAddress,
        updatedAt: sessionsTable.updatedAt,
        userAgent: sessionsTable.userAgent,
      })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.userId, context.user.id),
          gt(sessionsTable.expiresAt, new Date())
        )
      )
    const activity = await sessionActivity.read(rows.map(({ id }) => id))

    return rows
      .map(({ ipAddress, updatedAt, ...row }, index) => ({
        ...row,
        // A session no request has touched since activity was recorded only has the row's daily refresh and its sign-in IP.
        ipAddress: activity[index]?.ip ?? ipAddress,
        lastActiveAt: activity[index]?.at ?? updatedAt,
      }))
      .toSorted((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
  })
