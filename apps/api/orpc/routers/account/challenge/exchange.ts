import { db } from '@tamery/db'
import { connections, queries, sessions } from '@tamery/db/schema'
import { challenge } from '@tamery/shared/challenge'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'

import { auth } from '~/lib/auth'
import { ensureDefaultWorkspace } from '~/lib/workspace'
import { getWorkspaceSecret, orpc } from '~/orpc'

import { codeChallengeRedis } from './code-challenge'

const adoptAnonymousUser = async (anonymousUserId: string, userId: string) => {
  const workspaceId = await ensureDefaultWorkspace(userId)
  const [secret, guestConnections] = await Promise.all([
    getWorkspaceSecret(workspaceId),
    db
      .select({
        connectionString: connections.connectionString,
        id: connections.id,
        workspaceId: connections.workspaceId,
      })
      .from(connections)
      .where(eq(connections.userId, anonymousUserId)),
  ])
  const reencrypted = await Promise.all(
    guestConnections.flatMap(({ connectionString, id, workspaceId: from }) =>
      connectionString
        ? [
            getWorkspaceSecret(from).then((guestSecret) => ({
              connectionString: encrypt({
                secret,
                text: decrypt({
                  encryptedText: connectionString,
                  secret: guestSecret,
                }),
              }),
              id,
            })),
          ]
        : []
    )
  )

  await db.transaction(async (tx) => {
    await tx
      .update(connections)
      .set({ userId, workspaceId })
      .where(eq(connections.userId, anonymousUserId))
    await Promise.all(
      reencrypted.map(({ connectionString, id }) =>
        tx
          .update(connections)
          .set({ connectionString })
          .where(eq(connections.id, id))
      )
    )
    await tx
      .update(queries)
      .set({ userId })
      .where(eq(queries.userId, anonymousUserId))
  })

  const context = await auth.$context
  await context.internalAdapter.deleteUser(anonymousUserId)
}

export const exchange = orpc
  .input(
    type({
      codeChallenge: 'string',
      verifier: 'string',
    })
  )
  .errors({
    FORBIDDEN: {
      message: "We couldn't authenticate you. Please try signing in again.",
    },
    INTERNAL_SERVER_ERROR: {
      message:
        "We couldn't move your guest connections to your account. Please try signing in again.",
    },
    NOT_ACCEPTABLE: {
      message: "We couldn't authenticate you. Please try signing in again.",
    },
  })
  .handler(async ({ errors, input, context: { headers } }) => {
    if (challenge.generateCode(input.verifier) !== input.codeChallenge) {
      throw errors.NOT_ACCEPTABLE()
    }

    const data = await codeChallengeRedis.get(input.codeChallenge)

    if (!data) {
      throw errors.FORBIDDEN()
    }

    const current = await auth.api.getSession({ headers })

    if (current?.user.isAnonymous) {
      await adoptAnonymousUser(current.user.id, data.userId).catch((error) => {
        console.error(
          `Failed to adopt anonymous user ${current.user.id} into ${data.userId}`,
          error
        )
        throw errors.INTERNAL_SERVER_ERROR({ cause: error })
      })
    }

    const context = await auth.$context
    const { token, id } = await context.internalAdapter.createSession(
      data.userId
    )
    await Promise.all([
      codeChallengeRedis.delete(input.codeChallenge),
      db
        .update(sessions)
        .set({
          ipAddress: headers.get('X-Forwarded-For'),
          userAgent: headers.get('User-Agent'),
        })
        .where(eq(sessions.id, id)),
    ])
    return { newUser: data.newUser, token }
  })
