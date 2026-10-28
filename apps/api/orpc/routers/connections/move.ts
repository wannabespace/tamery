import { db } from '@tamery/db'
import { connections } from '@tamery/db/schema'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import {
  inEditableWorkspace,
  isWorkspaceEditor,
  revokeNonEditorShares,
  workspaceMemberIds,
} from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publishConnections } from './events'

export const move = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7', workspaceId: 'string.uuid.v7' }))
  .errors({
    FORBIDDEN: {
      message: 'You can only move a connection to a workspace you can edit.',
    },
    NOT_FOUND: { message: 'Connection not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const where = eq(connections.id, input.id)

    const fromWorkspaceId = await db.transaction(async (tx) => {
      // Locked until the re-encrypted string lands: an edit or move racing this one would write under the key it read before.
      const [found] = await tx
        .select({
          connectionString: connections.connectionString,
          workspaceId: connections.workspaceId,
        })
        .from(connections)
        .where(and(where, inEditableWorkspace(context.user.id)(connections)))
        .for('update')

      if (!found) {
        throw errors.NOT_FOUND()
      }

      if (found.workspaceId === input.workspaceId) {
        return null
      }

      if (!(await isWorkspaceEditor(context.user.id, input.workspaceId))) {
        throw errors.FORBIDDEN()
      }

      const [from, to] = await Promise.all([
        context.getWorkspaceSecret(found.workspaceId),
        context.getWorkspaceSecret(input.workspaceId),
      ])

      await tx
        .update(connections)
        .set({
          connectionString:
            found.connectionString &&
            encrypt({
              secret: to,
              text: decrypt({
                encryptedText: found.connectionString,
                secret: from,
              }),
            }),
          workspaceId: input.workspaceId,
        })
        .where(where)

      return found.workspaceId
    })

    if (!fromWorkspaceId) {
      return
    }

    const [sourceMembers, targetMembers] = await Promise.all([
      workspaceMemberIds(fromWorkspaceId),
      workspaceMemberIds(input.workspaceId),
      revokeNonEditorShares(input.workspaceId),
    ])

    // A member of both gets the row as an insert (an upsert) only: a delete would wipe the secrets their device keeps for it.
    await Promise.all([
      publishConnections({
        type: 'delete',
        userIds: sourceMembers.filter((id) => !targetMembers.includes(id)),
        where,
      }),
      publishConnections({ type: 'insert', userIds: targetMembers, where }),
    ])
  })
