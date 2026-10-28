import { connections, workspaces } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'

import { revokeNonEditorShares } from '~/lib/workspace'

import { publishConnections } from '../connections/events'
import { publisher } from './events'
import { workspaceRows } from './sync'

export const syncMembership = async (userId: string, workspaceId: string) => {
  const [[row]] = await Promise.all([
    workspaceRows(userId, eq(workspaces.id, workspaceId)),
    revokeNonEditorShares(workspaceId),
  ])
  const inWorkspace = eq(connections.workspaceId, workspaceId)

  if (!row) {
    await publishConnections({
      type: 'delete',
      userIds: [userId],
      where: inWorkspace,
    })
    await publisher.publish(userId, { key: workspaceId, type: 'delete' })
    return
  }

  await publisher.publish(userId, { type: 'insert', value: row })
  await publishConnections({
    type: 'insert',
    userIds: [userId],
    where: inWorkspace,
  })
}
