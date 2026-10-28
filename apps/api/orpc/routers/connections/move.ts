import { db } from '@tamery/db'
import { connections } from '@tamery/db/schema'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { type } from 'arktype'
import { and, eq, inArray } from 'drizzle-orm'

import {
  editableWorkspaces,
  isWorkspaceEditor,
  workspaceMemberIds,
} from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publishConnections } from '../workspaces/access'

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
    const [found] = await db
      .select({
        connectionString: connections.connectionString,
        workspaceId: connections.workspaceId,
      })
      .from(connections)
      .where(
        and(
          eq(connections.id, input.id),
          inArray(connections.workspaceId, editableWorkspaces(context.user.id))
        )
      )

    if (!found) {
      throw errors.NOT_FOUND()
    }

    if (found.workspaceId === input.workspaceId) {
      return
    }

    if (!(await isWorkspaceEditor(context.user.id, input.workspaceId))) {
      throw errors.FORBIDDEN()
    }

    const where = eq(connections.id, input.id)
    const [from, to] = await Promise.all([
      context.getWorkspaceSecret(found.workspaceId),
      context.getWorkspaceSecret(input.workspaceId),
    ])

    await db
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

    const [sourceMembers, targetMembers] = await Promise.all([
      workspaceMemberIds(found.workspaceId),
      workspaceMemberIds(input.workspaceId),
    ])

    // A member of both gets the row as an insert (an upsert) only: a delete would wipe the secrets their device keeps for it.
    await publishConnections({
      type: 'delete',
      userIds: sourceMembers.filter((id) => !targetMembers.includes(id)),
      where,
    })
    await publishConnections({ type: 'insert', userIds: targetMembers, where })
  })
