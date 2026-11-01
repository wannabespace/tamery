#!/usr/bin/env bun
import process from 'node:process'
import { parseArgs } from 'node:util'

import { log } from '@clack/prompts'
import { PORTS } from '@tamery/shared/ports'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { toError } from '@tamery/shared/utils'

import { pairings } from './bridge/pairings'
import { approve } from './commands/approve'
import { bridge } from './commands/bridge'
import { login } from './commands/login'
import { logout } from './commands/logout'
import { whoami } from './commands/whoami'
import { env } from './env'
import { HELP } from './help'
import { paint } from './paint'

const MAX_PORT = 65_535

const run = () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      help: { short: 'h', type: 'boolean' },
      port: { default: String(PORTS.BRIDGE), type: 'string' },
      'public-url': { type: 'string' },
      version: { short: 'v', type: 'boolean' },
    },
  })
  const command = positionals.join(' ')
  if (values.version) {
    return console.log(env.VERSION)
  }
  if (values.help || !command) {
    return console.log(HELP)
  }
  if (command === 'bridge') {
    const port = Number(values.port)
    if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
      throw new Error('--port must be a number from 1 to 65535.')
    }
    return bridge({ port, publicUrl: values['public-url'] })
  }
  if (command === 'bridge approve') {
    return approve()
  }
  if (command === 'bridge unpair-all') {
    pairings.reset()
    return log.success(
      `Every browser is unpaired. Pair again with ${paint.accent('tamery bridge')}.`
    )
  }
  if (command === 'login') {
    return login()
  }
  if (command === 'logout') {
    return logout()
  }
  if (command === 'whoami') {
    return whoami()
  }
  if (command === 'proxy') {
    throw new Error(
      `${paint.accent('tamery proxy')} is now ${paint.accent('tamery bridge')}.`
    )
  }
  throw new Error(
    `Unknown command ${paint.accent(command)}. Run ${paint.accent('tamery --help')}.`
  )
}

try {
  await run()
} catch (error) {
  log.error(redactSecrets(toError(error).message))
  process.exit(1)
}
