import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import { type } from 'arktype'
import { inArray } from 'drizzle-orm'

import { auth } from '~/lib/auth'
import { accountMiddleware, orpc } from '~/orpc'

import { publishMembership, viaAuth } from './access'

const invitationInput = type({ invitationId: 'string' })

export const invitations = orpc
  .use(accountMiddleware)
  .handler(async ({ context: { headers } }) => {
    const now = new Date()
    const all = await viaAuth(auth.api.listUserInvitations({ headers }))
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
      role,
      workspaceName: organizationName,
    }))
  })

export const acceptInvitation = orpc
  .use(accountMiddleware)
  .input(invitationInput)
  .handler(async ({ context: { headers, user }, input }) => {
    const accepted = await viaAuth(
      auth.api.acceptInvitation({ body: input, headers })
    )

    if (accepted) {
      await publishMembership(user.id, accepted.member.organizationId)
    }

    return { workspaceId: accepted?.member.organizationId ?? null }
  })

export const rejectInvitation = orpc
  .use(accountMiddleware)
  .input(invitationInput)
  .handler(async ({ context: { headers }, input }) => {
    await viaAuth(auth.api.rejectInvitation({ body: input, headers }))
  })
