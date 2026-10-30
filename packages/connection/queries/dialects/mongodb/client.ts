import { createRequire } from 'node:module'

import type * as ShellParser from '@mongodb-js/shell-bson-parser'
import { SafeURL } from '@tamery/shared/safe-url'
import { Result } from 'better-result'
import { memoize } from 'memoza'
import type * as Mongo from 'mongodb'

import { sshForwarding } from '../../../ssh/forwarding'
import { deleteSshParams } from '../../../ssh/params'
import { socksProxy } from '../../../ssh/socks'

const require = createRequire(import.meta.url)

export const mongodb = require('mongodb') as typeof Mongo

// Its ESM wrapper loses every export under Bun, so it loads through `require` like the drivers do.
export const { parse: parseShellValue } =
  require('@mongodb-js/shell-bson-parser') as typeof ShellParser

// The driver's 30s default, times its reconnection retries, leaves the app "connecting" for minutes before an unreachable server surfaces.
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10_000

export const getClient = memoize(async (connectionString: string) => {
  const forwarding = await sshForwarding.of(connectionString)
  const url = new SafeURL(connectionString)
  deleteSshParams(url.searchParams)
  const setsOwnTimeout = [...url.searchParams.keys()].some(
    (key) => key.toLowerCase() === 'serverselectiontimeoutms'
  )
  if (!setsOwnTimeout) {
    url.searchParams.set(
      'serverSelectionTimeoutMS',
      String(DEFAULT_SERVER_SELECTION_TIMEOUT_MS)
    )
  }
  // The driver dials every member itself, so a tunnel or the cloud proxy's guard must reach them as a SOCKS proxy, not one forwarded socket.
  const proxy =
    forwarding && (await socksProxy((target) => forwarding.socketTo(target)))
  const client = new mongodb.MongoClient(url.toString(), {
    appName: 'Tamery',
    ...proxy?.options,
  })
  const connected = await Result.tryPromise(() => client.connect())
  if (connected.isErr()) {
    proxy?.close()
    throw connected.error.cause
  }
  return client
})

export const supportsTransactions = memoize(
  async (connectionString: string) => {
    const client = await getClient(connectionString)
    const hello = await client.db('admin').command({ hello: 1 })
    return Boolean(hello.setName) || hello.msg === 'isdbgrid'
  }
)
