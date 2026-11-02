import { ORPCError } from '@orpc/server'
import { connectionParts } from '@tamery/connection/connection-parts'
import { readConnectionString } from '@tamery/connection/parse-connection-string'
import { connectionSecrets } from '@tamery/connection/secrets'
import { getSshTunnel } from '@tamery/connection/ssh/params'
import {
  describeConnectionString,
  FILE_PARAMS,
  resourceConnectionString,
} from '@tamery/connection/utils'
import type { ConnectionInput } from '@tamery/query-proxy'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import {
  ConnectionType,
  getDialect,
} from '@tamery/shared/enums/connection-type'
import { SafeURL } from '@tamery/shared/safe-url'
import { Result } from 'better-result'

import { api } from '../api'
import { vault } from '../vault'
import { queryErrors } from './errors'

const FRESH_MS = 60 * 1000

interface ServerCopy {
  checkedAt: number
  connectionString: string | null
  isPasswordExists: boolean
  updatedAt: Date | null
}

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
    const { cause } = result.error
    const signedOut =
      cause instanceof ORPCError && cause.code === 'UNAUTHORIZED'
    const fallback = cached ?? (hasLocal ? LOCAL_ONLY : null)
    if (signedOut || !fallback) {
      throw cause
    }
    return fallback
  }
  if (result.value.status === 'not-found') {
    serverCopies.delete(connectionId)
    await vault.removeConnection(connectionId)
    throw new ORPCError('NOT_FOUND', queryErrors.NOT_FOUND)
  }
  const kept = result.value.status === 'unchanged' ? cached : null
  const copy: ServerCopy = {
    ...(result.value.status === 'modified'
      ? result.value
      : (kept ?? LOCAL_ONLY)),
    checkedAt: Date.now(),
  }
  serverCopies.set(connectionId, copy)
  return copy
}

const getLocalAccess = (connectionString: string) => {
  const parts = connectionParts.parse(connectionString)
  const { database, host, type } = parts
  const { searchParams } = readConnectionString(connectionString)
  const tunnel = getSshTunnel(searchParams)
  return [
    type === ConnectionType.SQLite && !host ? `the file ${database}` : null,
    ...FILE_PARAMS.map((param) =>
      searchParams.has(param) ? `${param} ${searchParams.get(param)}` : null
    ),
    describeConnectionString(connectionString).usesMachineCredentials
      ? `its ${searchParams.get('authmechanism')?.toUpperCase()} credentials for ${host}`
      : null,
    // A tunnel signs in with this computer's key file, ssh-agent or `~/.ssh/config` and reaches whatever the database host names
    // from the SSH host, so the whole route counts, defaults included: dropping `ssh_auth` alone would switch to the agent, and
    // dropping `ssh_port` or `ssh_user` to whatever `~/.ssh/config` names, so a missing one is never shown as its default.
    tunnel &&
      `SSH (${[tunnel.auth, tunnel.keyPath].filter(Boolean).join(' ')}) as ${tunnel.user || 'the default user'} to ${tunnel.host}${tunnel.port ? `:${tunnel.port}` : ' on the default port'}, on to ${host}:${connectionParts.port(parts)}`,
  ].filter((access) => access !== null)
}

const getAddedAccess = (before: string | null, after: string) => {
  const known = before ? getLocalAccess(before) : []
  return getLocalAccess(after).filter((access) => !known.includes(access))
}

const needsSecrets = (connectionId: string, fields: string[] | 'all') =>
  new ORPCError('NEEDS_SECRETS', {
    data: { connectionId, fields },
    message: queryErrors.NEEDS_SECRETS.message,
  })

export const connections = {
  resolve: async (input: ConnectionInput, dialect: Dialect) => {
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
    // Approval reads a string as its own connection type: SQLite under another dialect's name would open a file unasked.
    const { type } = connectionParts.parse(known)
    if (!type || getDialect(type) !== dialect) {
      throw new ORPCError('BAD_REQUEST', {
        message: `This connection does not run as ${dialect}.`,
      })
    }
    // Any workspace editor can change the server's copy, so a file or machine login it names runs only as the user saved it here.
    if (
      server.connectionString &&
      getAddedAccess(local, server.connectionString).length > 0
    ) {
      throw new ORPCError('UNCONFIRMED', queryErrors.UNCONFIRMED)
    }
    const connectionString =
      server.connectionString && local
        ? connectionSecrets.restore(server.connectionString, {
            isPasswordExists: server.isPasswordExists,
            local,
          })
        : known
    const url = new SafeURL(connectionString)
    const missing = [
      ...(server.isPasswordExists && !url.password ? ['password'] : []),
      ...connectionSecrets.missing(url.searchParams),
    ]
    if (missing.length > 0) {
      throw needsSecrets(connectionId, missing)
    }
    return input.resourceName
      ? resourceConnectionString(connectionString, input.resourceName)
      : connectionString
  },
  /**
   * `false` when the string asks for a file, SSH route or machine login the bridge's copy did not have and the person at its
   * terminal declined it: a paired browser's script could otherwise point the bridge at any file or host on this computer.
   */
  save: async (
    {
      connectionId,
      connectionString,
    }: {
      connectionId: string
      connectionString: string
    },
    confirm: (access: string[]) => Promise<boolean>
  ) => {
    // `resolve` trusts a local copy while the API is down, so only a connection the API confirms right now gets one.
    serverCopies.delete(connectionId)
    const { isPasswordExists } = await getServerCopy(connectionId, false)
    const previous = await vault.connection(connectionId)
    const next = previous
      ? connectionSecrets.restore(connectionString, {
          isPasswordExists,
          local: previous,
        })
      : connectionString
    const added = getAddedAccess(previous, next)
    if (added.length > 0 && !(await confirm(added))) {
      return false
    }
    await vault.setConnection(connectionId, next)
    return true
  },
}
