import process from 'node:process'

import { confirm, isCancel, log, password, spinner } from '@clack/prompts'
import { connectionParts } from '@tamery/connection/connection-parts'
import { executors } from '@tamery/connection/queries/executors'
import { connectionSecrets } from '@tamery/connection/secrets'
import { describeConnectionString } from '@tamery/connection/utils'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { silently } from '@tamery/shared/utils'
import { Result } from 'better-result'

import { analytics } from '../analytics'
import { api } from '../api'
import { getLocalAccess } from '../bridge/connections'
import { printable } from '../bridge/printable'
import { enableSshTunnels } from '../bridge/ssh'
import { paint } from '../paint'
import { getAccountForCommand } from '../sign-in'
import { vault } from '../vault'

export const SYNC_OPTIONS = {
  full: SyncType.Cloud,
  metadata: SyncType.CloudWithoutConnectionString,
  'no-password': SyncType.CloudWithoutSecrets,
} satisfies Record<string, SyncType>

const PING: Record<Dialect, string> = {
  clickhouse: 'SELECT 1',
  mongodb: 'db.runCommand({ ping: 1 })',
  mssql: 'SELECT 1',
  mysql: 'SELECT 1',
  oracle: 'SELECT 1 FROM DUAL',
  postgres: 'SELECT 1',
  sqlite: 'SELECT 1',
}

/** Read from a prompt or stdin, never a flag, so the password stays out of the shell's history. */
export const readConnectionString = async (message = 'Connection string') => {
  if (!process.stdin.isTTY) {
    const piped = await Bun.stdin.text()
    if (!piped.trim()) {
      throw new Error(
        'No connection string came in. Pipe it in, or run the command in a terminal to paste it.'
      )
    }
    return piped.trim()
  }
  const answer = await password({
    message,
    validate: (value) =>
      value?.trim() ? undefined : 'Paste the connection string.',
  })
  if (isCancel(answer)) {
    throw new Error('Cancelled.')
  }
  return answer.trim()
}

/**
 * The bridge runs a string from its vault without asking, so a file, SSH route or machine login gets into the vault only
 * once the person at this terminal allowed it, never from a script; and before the test, which already uses them.
 */
const confirmLocalAccess = async (connectionString: string) => {
  const access = getLocalAccess(connectionString).map(printable)
  if (access.length === 0) {
    return
  }
  const listed = access.map((item) => paint.bold(item)).join(', ')
  if (!process.stdin.isTTY) {
    throw new Error(
      `This connection uses ${listed} on this computer. Run the command in a terminal to allow it.`
    )
  }
  const allowed = await confirm({
    initialValue: false,
    message: `Allow this connection to use ${listed} on this computer?`,
  })
  if (allowed !== true) {
    throw new Error('Did not allow it.')
  }
}

const testConnectionString = async () => {
  const connectionString = await readConnectionString()
  const parsed = Result.try(() => connectionParts.parse(connectionString))
  const { database, provider, type } = parsed.isOk()
    ? parsed.value
    : { database: '', provider: null, type: null }
  if (!type) {
    throw new Error(
      'Tamery cannot read this connection string. Start it with its scheme, such as postgres://, mysql:// or mongodb://.'
    )
  }
  await confirmLocalAccess(connectionString)
  const dialect = getDialect(type)
  enableSshTunnels()
  const testing = spinner()
  testing.start('Connecting')
  try {
    await executors[dialect].execute({ connectionString, query: PING[dialect] })
  } catch (error) {
    testing.error('Could not connect')
    throw error
  }
  testing.stop('Connected')
  const { defaultResourceName, displayUrl, isPasswordPopulated, usesSsh } =
    describeConnectionString(connectionString)
  return {
    connectionString,
    defaultName:
      database && database === defaultResourceName
        ? `${displayUrl}/${database}`
        : displayUrl,
    defaultResourceName,
    isPasswordExists: isPasswordPopulated,
    provider,
    type,
    usesSsh,
  }
}

/** The bridge's copy of the string, and the resource the app opens it at, as the app's own save adds. */
const saveLocally = (
  connectionId: string,
  connectionString: string,
  resourceName: string | null
) =>
  Promise.all([
    vault.setConnection(connectionId, connectionString),
    api.connectionsResources.create({
      connectionId,
      id: Bun.randomUUIDv7(),
      name: resourceName,
    }),
  ])

/** Any workspace editor names a shared connection, and a control character in it would drive this terminal. */
const fetchConnections = async () => {
  const messages = await api.connections.sync([])
  return messages.flatMap((message) =>
    message.type === 'delete'
      ? []
      : [
          {
            ...message.value,
            label: message.value.label && printable(message.value.label),
            name: printable(message.value.name),
          },
        ]
  )
}

export const findConnection = async (ref: string) => {
  const connections = await fetchConnections()
  const matches = connections.filter(
    ({ id, name }) => id === ref || name === ref
  )
  const [match] = matches
  if (matches.length === 1 && match) {
    return match
  }
  const list = paint.accent('tamery connection list')
  throw new Error(
    matches.length === 0
      ? `No connection "${ref}". ${list} shows them.`
      : `Several connections are named "${ref}". Pass its id from ${list}.`
  )
}

export const listConnections = async () => {
  await getAccountForCommand()
  const fetched = await fetchConnections()
  const connections = fetched.toSorted(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  if (connections.length === 0) {
    log.info(
      `No connections yet. Add one with ${paint.accent('tamery connection create')}.`
    )
    return
  }
  const width = Math.max(...connections.map(({ name }) => name.length)) + 3
  for (const { id, label, name, type } of connections) {
    console.log(
      `${paint.dim(id)}  ${paint.bold(name.padEnd(width))}${[type, label].filter(Boolean).join(paint.dim(' · '))}`
    )
  }
}

export const createConnection = async (options: {
  label: string | undefined
  name: string | undefined
  sync: keyof typeof SYNC_OPTIONS
}) => {
  await getAccountForCommand()
  const syncType = SYNC_OPTIONS[options.sync]
  const tested = await testConnectionString()
  const id = Bun.randomUUIDv7()
  const name = options.name || tested.defaultName
  await api.connections.create({
    color: null,
    connectionString: connectionSecrets.forSync(
      tested.connectionString,
      syncType
    ),
    id,
    isPasswordExists: tested.isPasswordExists,
    label: options.label || null,
    name,
    provider: tested.provider,
    syncType,
    type: tested.type,
  })
  const finished = await Result.tryPromise(() =>
    saveLocally(id, tested.connectionString, tested.defaultResourceName)
  )
  if (finished.isErr()) {
    await silently(() => api.connections.remove({ id }))
    await silently(() => vault.removeConnection(id))
    throw finished.error.cause
  }
  await analytics.capture('connection_created', {
    origin: 'cli',
    ssh: tested.usesSsh,
    syncType,
    type: tested.type,
  })
  log.success(`Created ${paint.bold(name)} ${paint.dim(id)}`)
}

export const updateConnection = async (options: {
  'connection-string': boolean | undefined
  connection: string
  label: string | undefined
  name: string | undefined
}) => {
  if (
    !options.name &&
    options.label === undefined &&
    !options['connection-string']
  ) {
    throw new Error(
      'Nothing to change. Pass --name, --label or --connection-string.'
    )
  }
  await getAccountForCommand()
  const found = await findConnection(options.connection)
  const tested = options['connection-string']
    ? await testConnectionString()
    : null
  await api.connections.update({
    id: found.id,
    updatedAt: new Date(),
    ...(options.name && { name: options.name }),
    ...(options.label !== undefined && { label: options.label || null }),
    ...(tested && {
      connectionString: connectionSecrets.forSync(
        tested.connectionString,
        found.syncType
      ),
      isPasswordExists: tested.isPasswordExists,
      provider: tested.provider,
      type: tested.type,
    }),
  })
  if (tested) {
    await saveLocally(
      found.id,
      tested.connectionString,
      tested.defaultResourceName
    )
  }
  await analytics.capture('connection_updated', {
    connection_string: !!tested,
    label: options.label !== undefined,
    name: !!options.name,
    type: tested?.type ?? found.type,
  })
  log.success(`Updated ${paint.bold(options.name || found.name)}`)
}

export const deleteConnection = async (options: {
  connection: string
  yes: boolean | undefined
}) => {
  await getAccountForCommand()
  const found = await findConnection(options.connection)
  if (!options.yes) {
    if (!process.stdin.isTTY) {
      throw new Error('Pass --yes to delete without a terminal to confirm in.')
    }
    const confirmed = await confirm({
      initialValue: false,
      message: `Delete ${paint.bold(found.name)} for everyone in its workspace?`,
    })
    if (isCancel(confirmed) || !confirmed) {
      log.info(`Kept ${paint.bold(found.name)}.`)
      return
    }
  }
  await api.connections.remove({ id: found.id })
  await vault.removeConnection(found.id)
  await analytics.capture('connection_removed', {
    type: found.type,
  })
  log.success(`Deleted ${paint.bold(found.name)}`)
}
