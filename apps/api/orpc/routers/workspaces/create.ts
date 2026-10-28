import { db } from '@tamery/db'
import { members, workspaces } from '@tamery/db/schema'
import { type } from 'arktype'

import { workspaceEncryptionKey } from '~/lib/encryption-key'
import { workspaceSlug } from '~/lib/workspace'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

import { publisher } from './events'

export const create = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('workspace.create'))
  .input(type({ name: 'string > 0' }))
  .handler(async ({ context, input }) => {
    const workspace = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(workspaces)
        .values({
          name: input.name,
          slug: workspaceSlug(input.name),
        })
        .returning()

      if (!row) {
        throw new Error('Failed to create workspace')
      }

      await tx.insert(members).values({
        role: 'owner',
        userId: context.user.id,
        workspaceId: row.id,
      })
      await workspaceEncryptionKey.create(row.id, tx)

      return { ...row, role: 'owner' as const }
    })

    publisher.publish(context.user.id, {
      type: 'insert',
      value: workspace,
    })

    return workspace
  })
