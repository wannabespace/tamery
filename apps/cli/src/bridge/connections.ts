import { ORPCError } from '@orpc/server'
import { connectionSecrets } from '@tamery/connection/secrets'
import { resourceConnectionString } from '@tamery/connection/utils'
import type { ConnectionInput } from '@tamery/query-proxy'
import { SafeURL } from '@tamery/shared/safe-url'
import { Result } from 'better-result'

import { api } from '../api'
import { vault } from '../vault'
import { NEEDS_SECRETS_MESSAGE, NOT_FOUND_MESSAGE } from './errors'

/** How long a server copy is trusted before `connections.resolve` is asked again, so a query rarely waits on the API. */
const FRESH_MS = 60 * 1000

interface ServerCopy {
  checkedAt: number
  /** `null` for **Metadata only**: the server keeps no string. */
  connectionString: string | null
  isPasswordExists: boolean
  updatedAt: Date | null
}

/** With the API unreachable and nothing resolved yet, the local copy is the whole string the user entered. */
const LOCAL_ONLY: ServerCopy = {
  checkedAt: 0,
  connectionString: null,
  isPasswordExists: false,
  updatedAt: null,
}

const serverCopies = new Map<string, ServerCopy>()

const getServerCopy = async (connectionId: string, hasLocal: boolean) => {
  const cached = serverCopies.get(connectionId) ?? null
  if (cached && Date.now() - cached.checkedAt < FRESH_MS) {
    return cached
  }
  const result = await Result.tryPromise(() =>
    api.connections.resolve({
      id: connectionId,
      ...(cached?.updatedAt && { updatedAt: cached.updatedAt }),
    })
  )
  if (result.isErr()) {
    const fallback = cached ?? (hasLocal ? LOCAL_ONLY : null)
    if (!fallback) {
      throw result.error.cause
    }
    return fallback
  }
  if (result.value.status === 'not-found') {
    serverCopies.delete(connectionId)
    await vault.removeConnection(connectionId)
    throw new ORPCError('NOT_FOUND', { message: NOT_FOUND_MESSAGE })
  }
  // Asked without a version, `unchanged` can only mean the server holds no string.
  const copy: ServerCopy =
    result.value.status === 'modified'
      ? { ...result.value, checkedAt: Date.now() }
      : { ...(cached ?? LOCAL_ONLY), checkedAt: Date.now() }
  serverCopies.set(connectionId, copy)
  return copy
}

const getMissing = (connectionString: string, isPasswordExists: boolean) => {
  const url = new SafeURL(connectionString)
  const missing: string[] = connectionSecrets.missing(url.searchParams)
  return isPasswordExists && !url.password ? ['password', ...missing] : missing
}

const needsSecrets = (connectionId: string, fields: string[] | 'all') =>
  new ORPCError('NEEDS_SECRETS', {
    data: { connectionId, fields },
    message: NEEDS_SECRETS_MESSAGE,
  })

export const connections = {
  /** The bridge never runs a string it is sent: it builds each one the way a device does, from the server's copy and its own. */
  resolve: async (input: ConnectionInput) => {
    if (!('connectionId' in input)) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'The bridge runs saved connections only. Update Tamery.',
      })
    }
    const { connectionId } = input
    const local = await vault.connection(connectionId)
    const server = await getServerCopy(connectionId, !!local)
    const known = server.connectionString ?? local
    if (!known) {
      throw needsSecrets(connectionId, 'all')
    }
    const connectionString =
      server.connectionString && local
        ? connectionSecrets.restore(server.connectionString, {
            isPasswordExists: server.isPasswordExists,
            local,
          })
        : known
    const missing = getMissing(connectionString, server.isPasswordExists)
    if (missing.length > 0) {
      throw needsSecrets(connectionId, missing)
    }
    return input.resourceName
      ? resourceConnectionString(connectionString, input.resourceName)
      : connectionString
  },
  /** The browser sends only the fields the bridge asked for; a secret saved earlier and not asked for must survive. */
  save: async ({
    connectionId,
    connectionString,
  }: {
    connectionId: string
    connectionString: string
  }) => {
    const previous = await vault.connection(connectionId)
    await vault.setConnection(
      connectionId,
      previous
        ? connectionSecrets.restore(connectionString, {
            isPasswordExists: true,
            local: previous,
          })
        : connectionString
    )
  },
}
