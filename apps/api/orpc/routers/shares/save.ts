import { db } from '@tamery/db'
import { shares, users } from '@tamery/db/schema'
import { SHARE_ACCOUNT_MESSAGE } from '@tamery/shared/constants'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { shareSaveInput } from '@tamery/shared/share'
import { FREE_SHARE_LIMIT_MESSAGE } from '@tamery/shared/usage'
import { pick } from '@tamery/shared/utils'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'

import { inMemberWorkspace, isWorkspaceEditor } from '~/lib/workspace'
import { orpc, permissionsMiddleware } from '~/orpc'

export const save = orpc
  .use(permissionsMiddleware)
  .input(shareSaveInput)
  .errors({
    ACCOUNT_REQUIRED: { message: SHARE_ACCOUNT_MESSAGE },
    FORBIDDEN: { message: FREE_SHARE_LIMIT_MESSAGE },
    NOT_FOUND: { message: 'This share or its connection no longer exists.' },
    NOT_SYNCED: {
      message: 'Only a connection synced with Full can be shared.',
    },
    READ_ONLY: {
      message: 'Only editors can share this workspace’s tables.',
      status: 403,
    },
  })
  .handler(async ({ context, errors, input }) => {
    if (context.user.isAnonymous) {
      throw errors.ACCOUNT_REQUIRED()
    }
    const { id, password } = input
    const resource = await db.query.connectionsResources.findFirst({
      columns: { id: true },
      where: {
        connection: { RAW: inMemberWorkspace(context.user.id) },
        id: { eq: input.connectionResourceId },
      },
      with: { connection: { columns: { syncType: true, workspaceId: true } } },
    })

    if (!resource?.connection) {
      throw errors.NOT_FOUND()
    }
    if (
      !(await isWorkspaceEditor(
        context.user.id,
        resource.connection.workspaceId
      ))
    ) {
      throw errors.READ_ONLY()
    }
    if (resource.connection.syncType !== SyncType.Cloud) {
      throw errors.NOT_SYNCED()
    }

    const changes = {
      ...pick(input, [
        'description',
        'expiresAt',
        'maxRows',
        'name',
        'refresh',
      ]),
      failingSince: null,
      view: pick(input, ['columnTypes', 'columns', 'filters', 'orderBy']),
      ...(password !== undefined && {
        passwordHash: password && (await Bun.password.hash(password)),
      }),
    }

    if (id) {
      const [row] = await db
        .update(shares)
        .set(changes)
        .where(
          and(
            eq(shares.id, id),
            eq(shares.userId, context.user.id),
            eq(shares.connectionResourceId, input.connectionResourceId),
            eq(shares.schema, input.schema),
            eq(shares.table, input.table)
          )
        )
        .returning({ id: shares.id })
      if (!row) {
        throw errors.NOT_FOUND()
      }
      return row
    }

    // The user's row lock serializes their saves, or two at once both count under the free limit.
    return db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, context.user.id))
        .for('update')

      const count = await tx.$count(
        shares,
        and(
          eq(shares.userId, context.user.id),
          or(isNull(shares.expiresAt), gt(shares.expiresAt, sql`now()`))
        )
      )

      if (!context.permissions.check('share.create', { count })) {
        throw errors.FORBIDDEN()
      }

      const [row] = await tx
        .insert(shares)
        .values({
          ...changes,
          ...pick(input, ['connectionResourceId', 'schema', 'table']),
          userId: context.user.id,
        })
        .returning({ id: shares.id })
      return row
    })
  })
