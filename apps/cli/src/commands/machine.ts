import os from 'node:os'
import process from 'node:process'

import { intro, log, outro } from '@clack/prompts'
import { hasErrnoCode } from '@tamery/shared/errno'
import { MACHINE_PAIR_PATH } from '@tamery/shared/machine'
import { PORTS } from '@tamery/shared/ports'
import { Result } from 'better-result'

import { analytics } from '../analytics'
import { openBrowser } from '../browser'
import { configFiles } from '../config-files'
import { env } from '../env'
import { approvals } from '../machine/approvals'
import { pairings } from '../machine/pairings'
import { runMachine } from '../machine/run'
import { paint } from '../paint'
import { getAccount } from '../sign-in'
import { updates } from '../update-check'
import { vault } from '../vault'

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
  approvals.clear()
  const started = await Result.tryPromise(() =>
    runMachine({
      approver: approvals,
      name,
      port: options.port,
      publicUrl,
      userId: account.id,
    })
  )
  if (started.isErr()) {
    const { cause } = started.error
    if (hasErrnoCode(cause, 'EADDRINUSE')) {
      throw new Error(
        `Port ${options.port} is busy. Is another machine running? Use --port to pick another.`
      )
    }
    throw cause
  }
  const { registerError, stop, url } = started.value
  void updates.check()
  if (registerError) {
    log.warn(
      `Could not list this machine in your account: ${registerError} No connection runs on it until it is listed; it tries again every 5 minutes.`
    )
  }
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

  const connectUrl = `${env.WEB_URL}${MACHINE_PAIR_PATH}`
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

  const quit = async () => {
    await stop()
    outro(`Machine on ${name} stopped.`)
    await analytics.shutdown()
    process.exit(0)
  }
  process.once('SIGINT', quit)
  process.once('SIGTERM', quit)
}
