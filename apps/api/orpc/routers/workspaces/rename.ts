import { db } from '@tamery/db'
import { members, workspaces } from '@tamery/db/schema'
import { MEMBER_MANAGER_ROLES } from '@tamery/shared/workspace'
import { type } from 'arktype'
import { and, eq, inArray } from 'drizzle-orm'

import { workspaceMemberIds } from '~/lib/workspace'
import { accountMiddleware, orpc } from '~/orpc'

import { publisher } from './events'
import { workspaceRows } from './sync'

export const rename = orpc
  .use(accountMiddleware)
  .input(type({ name: 'string > 0', workspaceId: 'string.uuid.v7' }))
  .errors({
    FORBIDDEN: { message: 'Only owners and admins can rename this workspace.' },
  })
  .handler(async ({ context, errors, input }) => {
    const inWorkspace = eq(workspaces.id, input.workspaceId)
    const [renamed] = await db
      .update(workspaces)
      .set({ name: input.name })
      .where(
        and(
          inWorkspace,
          inArray(
            workspaces.id,
            db
              .select({ id: members.workspaceId })
              .from(members)
              .where(
                and(
                  eq(members.userId, context.user.id),
                  inArray(members.role, MEMBER_MANAGER_ROLES)
                )
              )
          )
        )
      )
      .returning({ id: workspaces.id })

    if (!renamed) {
      throw errors.FORBIDDEN()
    }

    // Each member's row carries their own role, so one payload can't go to all of them.
    const userIds = await workspaceMemberIds(input.workspaceId)
    await Promise.all(
      userIds.map(async (userId) => {
        const [row] = await workspaceRows(userId, inWorkspace)
        if (row) {
          await publisher.publish(userId, { type: 'update', value: row })
        }
      })
    )
  })
