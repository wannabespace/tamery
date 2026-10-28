import process from 'node:process'

import { db } from '@tamery/db'
import { sessions, users } from '@tamery/db/schema'
import { and, eq, exists, gt, not } from 'drizzle-orm'

import { auth } from '~/lib/auth'

const shouldDelete = process.argv.includes('--delete')

const staleGuests = await db
  .select({ createdAt: users.createdAt, id: users.id })
  .from(users)
  .where(
    and(
      eq(users.isAnonymous, true),
      not(
        exists(
          db
            .select()
            .from(sessions)
            .where(
              and(
                eq(sessions.userId, users.id),
                gt(sessions.expiresAt, new Date())
              )
            )
        )
      )
    )
  )

console.table(staleGuests)

if (!shouldDelete) {
  console.log(
    `${staleGuests.length} guests without a live session. Re-run with --delete to delete them.`
  )
  process.exit(0)
}

const context = await auth.$context

for (const { id } of staleGuests) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- one at a time: each delete cascades to the user's own rows (sessions) and drops their sole-member workspaces with those workspaces' keys
  await context.internalAdapter.deleteUser(id)
}

console.log(`Deleted ${staleGuests.length} guests.`)
process.exit(0)
