#!/usr/bin/env bun
import process from 'node:process'

import { log } from '@clack/prompts'
import { PORTS } from '@tamery/shared/ports'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'
import type { ArgsDef, CommandContext, CommandDef } from 'citty'
import { defineCommand, runMain, showUsage } from 'citty'

import { pairings } from './bridge/pairings'
import { approve } from './commands/approve'
import { bridge } from './commands/bridge'
import { login } from './commands/login'
import { logout } from './commands/logout'
import { whoami } from './commands/whoami'
import { env } from './env'
import { paint } from './paint'

const MAX_PORT = 65_535

/** citty prints any error but its own usage errors with a stack trace; the CLI shows only the message, secrets redacted. */
const reportingErrors =
  <T extends ArgsDef>(run: (context: CommandContext<T>) => unknown) =>
  async (context: CommandContext<T>) => {
    const done = await Result.tryPromise(async () => {
      await run(context)
    })
    if (done.isErr()) {
      log.error(redactSecrets(toError(done.error.cause).message))
      process.exit(1)
    }
  }

const bridgeArgs = {
  port: {
    default: String(PORTS.BRIDGE),
    description: 'Port on 127.0.0.1',
    type: 'string',
    valueHint: 'port',
  },
  'public-url': {
    description: 'The HTTPS URL a tunnel on this computer serves the bridge at',
    type: 'string',
    valueHint: 'url',
  },
} satisfies ArgsDef

// A parent's `run` would also run after each subcommand's, so plain `tamery bridge` is the hidden default `start`.
const bridgeCommand = defineCommand({
  args: bridgeArgs,
  default: 'start',
  meta: {
    description: 'Let the web app run your connections on this computer',
    name: 'tamery bridge',
  },
  subCommands: {
    approve: defineCommand({
      meta: {
        description:
          'Allow a browser waiting to connect, when the bridge has no terminal',
        name: 'tamery bridge approve',
      },
      run: reportingErrors(approve),
    }),
    start: defineCommand({
      args: bridgeArgs,
      meta: { hidden: true, name: 'tamery bridge' },
      run: reportingErrors<typeof bridgeArgs>(({ args }) => {
        const port = Number(args.port)
        if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
          throw new Error('--port must be a number from 1 to 65535.')
        }
        return bridge({ port, publicUrl: args['public-url'] })
      }),
    }),
    'unpair-all': defineCommand({
      meta: {
        description: 'Disconnect every browser',
        name: 'tamery bridge unpair-all',
      },
      run: reportingErrors(() => {
        pairings.reset()
        log.success(
          `Every browser is unpaired. Pair again with ${paint.accent('tamery bridge')}.`
        )
      }),
    }),
  },
})

const main: CommandDef = defineCommand({
  default: 'help',
  meta: {
    description: 'Tamery from your terminal. Docs: https://docs.tamery.app/cli',
    name: 'tamery',
    version: env.VERSION,
  },
  subCommands: {
    bridge: bridgeCommand,
    help: defineCommand({
      meta: { hidden: true, name: 'tamery' },
      run: () => showUsage(main),
    }),
    login: defineCommand({
      meta: {
        description: 'Sign this computer in to your Tamery account',
        name: 'tamery login',
      },
      run: reportingErrors(login),
    }),
    logout: defineCommand({
      meta: {
        description: 'Sign out, forgetting saved secrets and paired browsers',
        name: 'tamery logout',
      },
      run: reportingErrors(logout),
    }),
    proxy: defineCommand({
      meta: { hidden: true, name: 'tamery proxy' },
      run: reportingErrors(() => {
        throw new Error(
          `${paint.accent('tamery proxy')} is now ${paint.accent('tamery bridge')}.`
        )
      }),
    }),
    whoami: defineCommand({
      meta: {
        description: 'Show which account this computer is signed in to',
        name: 'tamery whoami',
      },
      run: reportingErrors(whoami),
    }),
  },
})

// Each name is the full command line: citty would prefix only the direct parent's.
await runMain(main, { showUsage: (cmd) => showUsage(cmd) })
