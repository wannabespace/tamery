import { createRequire } from 'node:module'

import type * as ShellParser from '@mongodb-js/shell-bson-parser'
import { SafeURL } from '@tamery/shared/safe-url'
import { Result } from 'better-result'
import { memoize } from 'memoza'
import type * as Mongo from 'mongodb'

import { sshForwarding } from '../../../ssh/forwarding'
import { deleteSshParams } from '../../../ssh/params'
import type { OpenChannel } from '../../../ssh/socks'
import { socksProxy } from '../../../ssh/socks'

const require = createRequire(import.meta.url)

export const mongodb = require('mongodb') as typeof Mongo

// Its ESM wrapper loses every export under Bun, so it loads through `require` like the drivers do.
export const { parse: parseShellValue } =
  require('@mongodb-js/shell-bson-parser') as typeof ShellParser

let egressGuard: OpenChannel | undefined

// Routes every address the driver dials through a validated socket, so a replica-set member or SRV target cannot reach a private host a DNS-only guard never saw.
export const mongodbGuard = {
  use: (connect: OpenChannel) => {
    egressGuard = connect
  },
}

// The driver's 30s default, times its reconnection retries, leaves the app "connecting" for minutes before an unreachable server surfaces.
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10_000

export const getClient = memoize(async (connectionString: string) => {
  const forwarding = await sshForwarding.of(connectionString)
  const url = new SafeURL(connectionString)
  deleteSshParams(url.searchParams)
  const hasTimeoutOverride = [...url.searchParams.keys()].some(
    (key) => key.toLowerCase() === 'serverselectiontimeoutms'
  )
  // The driver dials every member itself, so a tunnel or the guard must reach them as a SOCKS proxy, not one forwarded socket.
  const open: OpenChannel | undefined = forwarding
    ? (target) => forwarding.socketTo(target)
    : egressGuard
  const proxy = open && (await socksProxy(open))
  const client = new mongodb.MongoClient(url.toString(), {
    appName: 'Tamery',
    ...(hasTimeoutOverride
      ? {}
      : { serverSelectionTimeoutMS: DEFAULT_SERVER_SELECTION_TIMEOUT_MS }),
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
