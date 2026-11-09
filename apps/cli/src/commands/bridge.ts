import os from 'node:os'
import process from 'node:process'

import { intro, log, outro } from '@clack/prompts'
import { confineDuckdbFiles } from '@tamery/connection/queries/dialects/duckdb/instances'
import { confineSqliteFiles } from '@tamery/connection/queries/dialects/sqlite/client'
import { resetTransactions } from '@tamery/connection/queries/transactions'
import { BRIDGE_PAIR_PATH, BRIDGE_URL } from '@tamery/shared/bridge'
import { hasErrnoCode } from '@tamery/shared/errno'
import { Result } from 'better-result'

import { approvals } from '../bridge/approvals'
import { pairings } from '../bridge/pairings'
import { createRouter } from '../bridge/router'
import { serveBridge } from '../bridge/server'
import { enableSshTunnels } from '../bridge/ssh'
import { openBrowser } from '../browser'
import { env } from '../env'
import { paint } from '../paint'
import { getAccount } from '../sign-in'
import { updates } from '../update-check'
import { vault } from '../vault'

export const bridge = async (options: {
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
  intro(`${paint.brand('◆ Tamery bridge')} ${paint.dim(env.VERSION)}`)
  const account = await getAccount()
  const name = os.hostname().replace(/\.local$/u, '')
  enableSshTunnels()
  confineDuckdbFiles()
  confineSqliteFiles()
  const router = createRouter({ name, userId: account.id })
  approvals.clear()
  const listening = Result.try(() =>
    serveBridge({ port: options.port, publicUrl, router })
  )
  if (listening.isErr()) {
    const { cause } = listening.error
    if (hasErrnoCode(cause, 'EADDRINUSE')) {
      throw new Error(
        `Port ${options.port} is busy. Is another bridge running? Use --port to pick another.`
      )
    }
    throw cause
  }
  const server = listening.value
  void updates.check()

  const url = `http://127.0.0.1:${server.port}`
  const reachedAt = publicUrl?.origin ?? url
  log.info(
    [
      `${paint.bold(name)} ${paint.dim('·')} ${account.email}`,
      `${paint.dim('Listening on')} ${url}`,
      ...(publicUrl ? [`${paint.dim('Reached at')} ${publicUrl.origin}`] : []),
    ].join('\n')
  )
  if (await vault.keyInFile()) {
    log.warn(
      'No keychain here: saved secrets are protected only by the permissions of ~/.config/tamery.'
    )
  }

  const connectUrl = `${env.WEB_URL}${BRIDGE_PAIR_PATH}${reachedAt === BRIDGE_URL ? '' : `#${new URLSearchParams({ url: reachedAt })}`}`
  const paired = [...new Set(pairings.labels())]
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
    outro(`Bridge on ${name} stopped.`)
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
