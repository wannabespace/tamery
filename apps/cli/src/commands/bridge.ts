import os from 'node:os'
import process from 'node:process'

import { intro, log, outro } from '@clack/prompts'
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
import { signIn } from '../sign-in'
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

const listen = (options: Parameters<typeof serveBridge>[0]) => {
  const result = Result.try(() => serveBridge(options))
  const cause = result.isErr() ? result.error.cause : null
  if (
    cause instanceof Error &&
    'code' in cause &&
    cause.code === 'EADDRINUSE'
  ) {
    throw new Error(
      `Port ${options.port} is busy. Is another bridge running? Use --port to pick another.`
    )
  }
  return result.unwrap()
}

export const bridge = async (options: {
  port: number
  publicUrl: string | undefined
}) => {
  const publicUrl = parsePublicUrl(options.publicUrl)
  intro(`${paint.brand('◆ Tamery bridge')} ${paint.dim(env.VERSION)}`)
  const account = (await vault.account()) ?? (await signIn())
  const name = os.hostname().replace(/\.local$/u, '')
  enableSshTunnels()
  const server = listen({
    port: options.port,
    publicUrl,
    router: createRouter({ name, userId: account.id }),
  })
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
  // The app's own default needs no address in the link; any other one is filled in for the user.
  const connectUrl = `${env.WEB_URL}${BRIDGE_PAIR_PATH}${reachedAt === BRIDGE_URL ? '' : `#${new URLSearchParams({ url: reachedAt })}`}`
  // An allowed browser keeps working across restarts, so only a first run needs a tab opened for it.
  if (pairings.count() === 0) {
    openBrowser(connectUrl)
  }
  log.step(
    `${paint.dim('Connect a browser at')} ${paint.link(connectUrl)}\n${paint.dim('Ctrl+C to stop')}`
  )

  const stop = async () => {
    await server.stop()
    await resetTransactions()
    outro(`Bridge on ${name} stopped.`)
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
