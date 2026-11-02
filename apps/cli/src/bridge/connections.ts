import { ORPCError } from '@orpc/server'
import { connectionParts } from '@tamery/connection/connection-parts'
import { readConnectionString } from '@tamery/connection/parse-connection-string'
import { connectionSecrets } from '@tamery/connection/secrets'
import { DEFAULT_SSH_PORT, getSshTunnel } from '@tamery/connection/ssh/params'
import {
  describeConnectionString,
  FILE_PARAMS,
  resourceConnectionString,
} from '@tamery/connection/utils'
import type { ConnectionInput } from '@tamery/query-proxy'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { SafeURL } from '@tamery/shared/safe-url'
import { Result } from 'better-result'

import { api } from '../api'
import { vault } from '../vault'
import {
  NEEDS_SECRETS_MESSAGE,
  NOT_FOUND_MESSAGE,
  UNCONFIRMED_MESSAGE,
} from './errors'

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

/** What a string makes this computer hand to the driver: a file to open or read, or the credentials of the machine's own login. */
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
    // from the SSH host, so the whole route counts, defaults included: dropping `ssh_auth` alone would switch to the agent.
    tunnel &&
      `SSH (${[tunnel.auth, tunnel.keyPath].filter(Boolean).join(' ')}) as ${tunnel.user || 'the default user'} to ${tunnel.host}:${tunnel.port || DEFAULT_SSH_PORT}, on to ${host}:${connectionParts.port(parts)}`,
  ].filter((access) => access !== null)
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
    // Any workspace editor can change the server's copy, so a file or machine login it names runs only as the user saved it here.
    const confirmed = local ? getLocalAccess(local) : []
    if (
      server.connectionString &&
      getLocalAccess(server.connectionString).some(
        (access) => !confirmed.includes(access)
      )
    ) {
      throw new ORPCError('UNCONFIRMED', { message: UNCONFIRMED_MESSAGE })
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
    await getServerCopy(connectionId, false)
    const previous = await vault.connection(connectionId)
    const next = previous
      ? connectionSecrets.restore(connectionString, {
          isPasswordExists: true,
          local: previous,
        })
      : connectionString
    const known = previous ? getLocalAccess(previous) : []
    const added = getLocalAccess(next).filter(
      (access) => !known.includes(access)
    )
    if (added.length > 0 && !(await confirm(added))) {
      return false
    }
    await vault.setConnection(connectionId, next)
    return true
  },
}
