import { db } from '@tamery/db'
import { members, workspaces } from '@tamery/db/schema'
import { type } from 'arktype'
import type { SQL } from 'drizzle-orm'
import { and, eq, sql } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'
import { idIn, syncDiff } from '~/orpc/lib/sync'

import { output as eventOutput } from './events'

const output = eventOutput.array()

const updatedAt =
  sql<Date>`greatest(${workspaces.updatedAt}, ${members.updatedAt})`.mapWith(
    workspaces.updatedAt
  )

export const workspaceRows = (userId: string, filter?: SQL) =>
  db
    .select({
      createdAt: workspaces.createdAt,
      id: workspaces.id,
      logo: workspaces.logo,
      metadata: workspaces.metadata,
      name: workspaces.name,
      role: members.role,
      slug: workspaces.slug,
      updatedAt,
    })
    .from(workspaces)
    .innerJoin(members, eq(members.workspaceId, workspaces.id))
    .where(and(eq(members.userId, userId), filter))

export const sync = orpc
  .use(authMiddleware)
  .input(
    type({
      id: 'string.uuid.v7',
      updatedAt: 'Date',
    }).array()
  )
  .output(output)
  .handler(async ({ input, context }) => {
    const userId = context.user.id
    const { updatedItems, newItems, missingIds } = await syncDiff({
      input,
      queries: {
        rows: (ids) => workspaceRows(userId, idIn(workspaces.id, ids)),
        versions: () =>
          db
            .select({ id: workspaces.id, updatedAt })
            .from(workspaces)
            .innerJoin(members, eq(members.workspaceId, workspaces.id))
            .where(eq(members.userId, userId)),
      },
    })
    const syncResult: typeof output.infer = []

    for (const item of updatedItems) {
      syncResult.push({ type: 'update', value: item })
    }

    for (const item of newItems) {
      syncResult.push({ type: 'insert', value: item })
    }

    for (const item of missingIds) {
      syncResult.push({ key: item, type: 'delete' })
    }

    return syncResult
  })
