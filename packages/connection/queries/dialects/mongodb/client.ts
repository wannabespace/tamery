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

/** Its ESM wrapper loses every export under Bun, so it loads through `require` like the drivers do. */
export const { parse: parseShellValue } =
  require('@mongodb-js/shell-bson-parser') as typeof ShellParser

let egressGuard: OpenChannel | undefined

/**
 * The cloud proxy installs this so every server the driver dials — a seed, a replica set member, an SRV target and a
 * literal IP among them — is reached through a validated socket, closing the private hosts a DNS-only guard never saw.
 */
export const mongodbGuard = {
  use: (connect: OpenChannel) => {
    egressGuard = connect
  },
}

export const getClient = memoize(async (connectionString: string) => {
  const forwarding = await sshForwarding.of(connectionString)
  const url = new SafeURL(connectionString)
  deleteSshParams(url.searchParams)
  // The driver takes no stream and dials every member itself, so a tunnel or the guard reaches them as a SOCKS proxy.
  const open: OpenChannel | undefined = forwarding
    ? (target) => forwarding.socketTo(target)
    : egressGuard
  const proxy = open && (await socksProxy(open))
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
