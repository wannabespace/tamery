import { invitableRole, workspaceRole } from '@tamery/shared/workspace'
import { type } from 'arktype'

import { auth } from '~/lib/auth'
import { accountMiddleware, orpc, viaAuth } from '~/orpc'

import { syncMembership } from './membership'

const workspaceInput = type({ workspaceId: 'string.uuid.v7' })

export const members = orpc
  .use(accountMiddleware)
  .input(workspaceInput)
  .handler(async ({ context: { headers, user }, input }) => {
    const query = { organizationId: input.workspaceId }
    const [{ members: rows }, invitations] = await Promise.all([
      viaAuth(auth.api.listMembers({ headers, query })),
      viaAuth(auth.api.listInvitations({ headers, query })),
    ])
    const now = new Date()

    return {
      invitations: invitations
        .filter(
          (invitation) =>
            invitation.status === 'pending' && invitation.expiresAt > now
        )
        .map(({ email, id, role }) => ({
          email,
          id,
          role: invitableRole.assert(role),
        })),
      members: rows.map(({ id, role, user: member, userId }) => ({
        email: member.email,
        id,
        isYou: userId === user.id,
        name: member.name,
        role: workspaceRole.assert(role),
      })),
    }
  })

export const invite = orpc
  .use(accountMiddleware)
  .input(
    workspaceInput.merge({
      email: 'string.email',
      role: invitableRole,
    })
  )
  .handler(async ({ context: { headers }, input }) => {
    await viaAuth(
      auth.api.createInvitation({
        body: {
          email: input.email,
          organizationId: input.workspaceId,
          role: input.role,
        },
        headers,
      })
    )
  })

export const cancelInvitation = orpc
  .use(accountMiddleware)
  .input(type({ invitationId: 'string' }))
  .handler(async ({ context: { headers }, input }) => {
    await viaAuth(auth.api.cancelInvitation({ body: input, headers }))
  })

export const removeMember = orpc
  .use(accountMiddleware)
  .input(workspaceInput.merge({ memberId: 'string' }))
  .handler(async ({ context: { headers }, input }) => {
    const removed = await viaAuth(
      auth.api.removeMember({
        body: {
          memberIdOrEmail: input.memberId,
          organizationId: input.workspaceId,
        },
        headers,
      })
    )

    await syncMembership(removed.member.userId, input.workspaceId)
  })

export const updateMemberRole = orpc
  .use(accountMiddleware)
  .input(
    workspaceInput.merge({
      memberId: 'string',
      role: workspaceRole,
    })
  )
  .handler(async ({ context: { headers }, input }) => {
    const member = await viaAuth(
      auth.api.updateMemberRole({
        body: {
          memberId: input.memberId,
          organizationId: input.workspaceId,
          role: input.role,
        },
        headers,
      })
    )

    await syncMembership(member.userId, input.workspaceId)
  })

export const leave = orpc
  .use(accountMiddleware)
  .input(workspaceInput)
  .handler(async ({ context: { headers, user }, input }) => {
    await viaAuth(
      auth.api.leaveOrganization({
        body: { organizationId: input.workspaceId },
        headers,
      })
    )
    await syncMembership(user.id, input.workspaceId)
  })
