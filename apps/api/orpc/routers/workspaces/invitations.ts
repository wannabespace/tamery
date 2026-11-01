import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import { invitableRole } from '@tamery/shared/workspace'
import { type } from 'arktype'
import { inArray } from 'drizzle-orm'

import { auth } from '~/lib/auth'
import { orpc, workspaceAuthMiddleware } from '~/orpc'

import { syncMembership } from './membership'

const invitationInput = type({ invitationId: 'string' })

export const invitations = orpc
  .use(workspaceAuthMiddleware)
  .handler(async ({ context: { headers } }) => {
    const now = new Date()
    const all = await auth.api.listUserInvitations({ headers })
    const pending = all.filter((invitation) => invitation.expiresAt > now)
    const inviters =
      pending.length > 0
        ? await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(
              inArray(
                users.id,
                pending.map((invitation) => invitation.inviterId)
              )
            )
        : []

    return pending.map(({ id, inviterId, organizationName, role }) => ({
      id,
      inviterName:
        inviters.find((inviter) => inviter.id === inviterId)?.name ?? null,
      role: invitableRole.assert(role),
      workspaceName: organizationName,
    }))
  })

export const acceptInvitation = orpc
  .use(workspaceAuthMiddleware)
  .input(invitationInput)
  .handler(async ({ context: { headers, user }, input }) => {
    const accepted = await auth.api.acceptInvitation({ body: input, headers })

    await syncMembership(user.id, accepted.member.organizationId)

    return { workspaceId: accepted.member.organizationId }
  })

export const rejectInvitation = orpc
  .use(workspaceAuthMiddleware)
  .input(invitationInput)
  .handler(async ({ context: { headers }, input }) => {
    await auth.api.rejectInvitation({ body: input, headers })
  })
