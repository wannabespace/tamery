import os from 'node:os'
import process from 'node:process'

import { intro, log, outro } from '@clack/prompts'
import { confineSqliteFiles } from '@tamery/connection/queries/dialects/sqlite/client'
import { resetTransactions } from '@tamery/connection/queries/transactions'
import { BRIDGE_PAIR_PATH, BRIDGE_URL } from '@tamery/shared/bridge'
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

const parsePublicUrl = (value: string | undefined) => {
  if (!value) {
    return null
  }
  const url = URL.parse(value)
  if (url?.protocol !== 'https:' || url.username || url.password) {
    throw new Error(
      '--public-url must be an https:// URL, such as https://db-box.tail1234.ts.net.'
    )
  }
  return url
}

export const bridge = async (options: {
  port: number
  publicUrl: string | undefined
}) => {
  const publicUrl = parsePublicUrl(options.publicUrl)
  intro(`${paint.brand('◆ Tamery bridge')} ${paint.dim(env.VERSION)}`)
  const account = await getAccount()
  const name = os.hostname().replace(/\.local$/u, '')
  enableSshTunnels()
  confineSqliteFiles()
  const router = createRouter({ name, userId: account.id })
  const listening = Result.try(() =>
    serveBridge({ port: options.port, publicUrl, router })
  )
  const cause = listening.isErr() ? listening.error.cause : null
  if (
    cause instanceof Error &&
    'code' in cause &&
    cause.code === 'EADDRINUSE'
  ) {
    throw new Error(
      `Port ${options.port} is busy. Is another bridge running? Use --port to pick another.`
    )
  }
  const server = listening.unwrap()
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

  approvals.clear()
  const connectUrl = `${env.WEB_URL}${BRIDGE_PAIR_PATH}${reachedAt === BRIDGE_URL ? '' : `#${new URLSearchParams({ url: reachedAt })}`}`
  if (pairings.count() === 0) {
    void openBrowser(connectUrl)
  }
  log.step(
    `${paint.dim('Connect a browser at')} ${paint.link(connectUrl)}\n${paint.dim('Ctrl+C to stop')}`
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
