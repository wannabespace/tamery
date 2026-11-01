import os from 'node:os'
import process from 'node:process'

import { intro, log, note, outro } from '@clack/prompts'
import { resetTransactions } from '@tamery/connection/queries/transactions'
import { BRIDGE_PAIR_PATH } from '@tamery/shared/bridge'
import { Result } from 'better-result'

import { pairings } from '../bridge/pairings'
import { createRouter } from '../bridge/router'
import { serveBridge } from '../bridge/server'
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
  const server = listen({
    port: options.port,
    publicUrl,
    router: createRouter({ name, userId: account.id }),
  })
  void updates.check()

  const url = `http://127.0.0.1:${server.port}`
  log.info(
    `${paint.bold(name)} is signed in as ${paint.bold(account.email)} and listening on ${url}${publicUrl ? `, reached at ${publicUrl.origin}` : ''}.`
  )
  if (await vault.keyInFile()) {
    log.warn(
      'No keychain here: saved secrets are protected only by the permissions of ~/.config/tamery.'
    )
  }

  const code = pairings.issueCode()
  const pairUrl = `${env.WEB_URL}${BRIDGE_PAIR_PATH}#${new URLSearchParams({ code, url: publicUrl?.origin ?? url })}`
  // A paired browser keeps working across restarts, so only a first run needs a tab opened for it.
  if (pairings.count() === 0) {
    openBrowser(pairUrl)
  }
  note(
    `${paint.link(pairUrl)}\n${paint.dim(`Or enter code ${paint.accent(code)} in Tamery → Settings → Bridge. It works once, for 10 minutes.`)}`,
    'Pair a browser'
  )
  log.message(paint.dim('Ctrl+C to stop.'))

  const stop = async () => {
    await server.stop()
    await resetTransactions()
    outro(`Bridge on ${name} stopped.`)
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
