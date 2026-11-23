import os from 'node:os'
import process from 'node:process'

import { intro, log, outro } from '@clack/prompts'
import { forwarding } from '@tamery/connection/forwarding'
import { confineDuckdbFiles } from '@tamery/connection/queries/dialects/duckdb/instances'
import { confineSqliteFiles } from '@tamery/connection/queries/dialects/sqlite/client'
import { resetTransactions } from '@tamery/connection/queries/transactions'
import { tunnelForwarding } from '@tamery/connection/ssh/tunnel'
import { hasErrnoCode } from '@tamery/shared/errno'
import { MACHINE_PAIR_PATH, MACHINE_URL } from '@tamery/shared/machine'
import { PORTS } from '@tamery/shared/ports'
import { silently, toError } from '@tamery/shared/utils'
import { Result } from 'better-result'

import { analytics } from '../analytics'
import { api } from '../api'
import { openBrowser } from '../browser'
import { configFiles } from '../config-files'
import { env } from '../env'
import { approvals } from '../machine/approvals'
import { hostKeys } from '../machine/host-keys'
import { machineIdentity } from '../machine/identity'
import { pairings } from '../machine/pairings'
import { createRouter } from '../machine/router'
import { serveMachine } from '../machine/server'
import { paint } from '../paint'
import { getAccount } from '../sign-in'
import { updates } from '../update-check'
import { vault } from '../vault'

/** Often enough that another device reads `seenAt` as up while the machine runs. */
const REGISTER_INTERVAL_MS = 5 * 60 * 1000
const MAX_NAME_LENGTH = 100

export const machine = async (options: {
  port: number
  publicUrl: string | undefined
}) => {
  const publicUrl = options.publicUrl ? URL.parse(options.publicUrl) : null
  if (
    options.publicUrl &&
    (publicUrl?.protocol !== 'https:' ||
      publicUrl.username ||
      publicUrl.password)
  ) {
    throw new Error(
      '--public-url must be an https:// URL, such as https://db-box.tail1234.ts.net.'
    )
  }
  intro(`${paint.brand('◆ Tamery machine')} ${paint.dim(env.VERSION)}`)
  const account = await getAccount()
  const name = os.hostname().replace(/\.local$/u, '')
  forwarding.use((connectionString) =>
    tunnelForwarding(connectionString, hostKeys.confirm(connectionString))
  )
  confineDuckdbFiles()
  confineSqliteFiles()
  const id = machineIdentity.get()
  const router = createRouter({ id, name, userId: account.id })
  approvals.clear()
  const listening = Result.try(() =>
    serveMachine({ port: options.port, publicUrl, router })
  )
  if (listening.isErr()) {
    const { cause } = listening.error
    if (hasErrnoCode(cause, 'EADDRINUSE')) {
      throw new Error(
        `Port ${options.port} is busy. Is another machine running? Use --port to pick another.`
      )
    }
    throw cause
  }
  const server = listening.value
  void updates.check()

  const url = `http://127.0.0.1:${server.port}`
  const reachedAt = publicUrl?.origin ?? url
  const register = () =>
    api.machines.register({
      id,
      name: name.slice(0, MAX_NAME_LENGTH),
      urls: publicUrl ? [publicUrl.origin, url] : [url],
    })
  const registered = await Result.tryPromise(register)
  if (registered.isErr()) {
    log.warn(
      `Could not list this machine in your account: ${toError(registered.error.cause).message} Browsers can still connect with its URL.`
    )
  }
  setInterval(() => silently(register), REGISTER_INTERVAL_MS)
  log.info(
    [
      `${paint.bold(name)} ${paint.dim('·')} ${account.email}`,
      `${paint.dim('Listening on')} ${url}`,
      ...(publicUrl ? [`${paint.dim('Reached at')} ${publicUrl.origin}`] : []),
    ].join('\n')
  )
  if (await vault.keyInFile()) {
    log.warn(
      `No keychain here: saved secrets are protected only by the permissions of ${configFiles.dir}.`
    )
  }

  const connectUrl = `${env.WEB_URL}${MACHINE_PAIR_PATH}${reachedAt === MACHINE_URL ? '' : `#${new URLSearchParams({ url: reachedAt })}`}`
  const paired = [...new Set(pairings.labels())]
  await analytics.capture('machine_started', {
    custom_port: options.port !== PORTS.MACHINE,
    paired_browsers: paired.length,
    remote: !!publicUrl,
  })
  if (paired.length === 0) {
    void openBrowser(connectUrl)
  }
  log.step(
    [
      ...(paired.length > 0
        ? [`Paired with ${paired.map((label) => paint.bold(label)).join(', ')}`]
        : []),
      `${paint.dim(paired.length > 0 ? 'Connect another browser at' : 'Connect a browser at')} ${paint.link(connectUrl)}`,
      paint.dim('Ctrl+C to stop'),
    ].join('\n')
  )

  const stop = async () => {
    await server.stop(true)
    await resetTransactions()
    outro(`Machine on ${name} stopped.`)
    await analytics.shutdown()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
