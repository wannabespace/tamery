#!/usr/bin/env bun
import process from 'node:process'

import { log } from '@clack/prompts'
import { PORTS } from '@tamery/shared/ports'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { objectEntries, toError } from '@tamery/shared/utils'
import { Result } from 'better-result'
import type { ArgsDef, CommandContext } from 'citty'
import { defineCommand, runMain } from 'citty'

import { analytics } from './analytics'
import { pairings } from './bridge/pairings'
import { approve } from './commands/approve'
import { bridge } from './commands/bridge'
import {
  createConnection,
  deleteConnection,
  listConnections,
  SYNC_OPTIONS,
  updateConnection,
} from './commands/connection'
import { login } from './commands/login'
import { logout } from './commands/logout'
import { FORMATS, query } from './commands/query'
import { update } from './commands/update'
import { whoami } from './commands/whoami'
import { env } from './env'
import { printHelp } from './help'
import { paint } from './paint'

const MAX_PORT = 65_535

/** citty prints any error but its own usage errors with a stack trace; the CLI shows only the message, secrets redacted. */
const reportingErrors =
  <T extends ArgsDef>(run: (context: CommandContext<T>) => unknown) =>
  async (context: CommandContext<T>) => {
    const done = await Result.tryPromise(async () => {
      await run(context)
    })
    await analytics.shutdown()
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
      run: reportingErrors(({ args }) => {
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
      run: reportingErrors(async () => {
        pairings.reset()
        await analytics.capture('bridge_unpaired_all', {})
        log.success(
          `Every browser is unpaired. Pair again with ${paint.accent('tamery bridge')}.`
        )
      }),
    }),
  },
})

/** A tested connection's driver keeps its pool open, which would keep the process from ever exiting. */
const exitingWhenDone =
  <T extends ArgsDef>(run: (context: CommandContext<T>) => unknown) =>
  async (context: CommandContext<T>) => {
    await reportingErrors(run)(context)
    process.exit(0)
  }

const connectionArg = {
  connection: {
    description: 'Its id or name',
    required: true,
    type: 'positional',
  },
} satisfies ArgsDef

const nameArgs = {
  label: {
    description: 'The label it is grouped under, such as prod',
    type: 'string',
    valueHint: 'label',
  },
  name: { description: 'Its name', type: 'string', valueHint: 'name' },
} satisfies ArgsDef

const createArgs = {
  ...nameArgs,
  sync: {
    default: 'full' as const,
    description:
      'What syncs to your other devices: the whole string, all but the password, or only the name',
    options: objectEntries(SYNC_OPTIONS).map(([option]) => option),
    type: 'enum',
  },
} satisfies ArgsDef

const updateArgs = {
  ...connectionArg,
  ...nameArgs,
  'connection-string': {
    description: 'Ask for a new connection string',
    type: 'boolean',
  },
} satisfies ArgsDef

const deleteArgs = {
  ...connectionArg,
  yes: { description: 'Delete without asking', type: 'boolean' },
} satisfies ArgsDef

const connectionCommand = defineCommand({
  default: 'help',
  meta: {
    description: 'List, create, update and delete your connections',
    name: 'tamery connection',
  },
  subCommands: {
    help: defineCommand({
      meta: { hidden: true, name: 'tamery connection' },
      run: () => printHelp(connectionCommand),
    }),
    create: defineCommand({
      args: createArgs,
      meta: {
        description:
          'Test a connection string, from a prompt or stdin, and save it',
        name: 'tamery connection create',
      },
      run: exitingWhenDone<typeof createArgs>(({ args }) =>
        createConnection(args)
      ),
    }),
    delete: defineCommand({
      args: deleteArgs,
      meta: {
        description: 'Delete a connection for everyone in its workspace',
        name: 'tamery connection delete',
      },
      run: exitingWhenDone<typeof deleteArgs>(({ args }) =>
        deleteConnection(args)
      ),
    }),
    list: defineCommand({
      meta: {
        description: 'List your connections with their ids',
        name: 'tamery connection list',
      },
      run: reportingErrors(listConnections),
    }),
    update: defineCommand({
      args: updateArgs,
      meta: {
        description: 'Rename a connection, or change its label or string',
        name: 'tamery connection update',
      },
      run: exitingWhenDone<typeof updateArgs>(({ args }) =>
        updateConnection(args)
      ),
    }),
  },
})

const queryArgs = {
  ...connectionArg,
  sql: {
    description: 'The statement; without it, read from stdin',
    required: false,
    type: 'positional',
  },
  database: {
    description: "Run in another database than the connection's own",
    type: 'string',
    valueHint: 'name',
  },
  format: {
    default: 'table' as const,
    description: 'How to print the rows',
    options: [...FORMATS],
    type: 'enum',
  },
  'max-rows': {
    default: '1000',
    description: 'Stop after this many rows',
    type: 'string',
    valueHint: 'count',
  },
  write: {
    description: 'Allow statements that change data or schema',
    type: 'boolean',
  },
} satisfies ArgsDef

const main = defineCommand({
  default: 'help',
  meta: {
    description: 'Tamery from your terminal.',
    name: 'tamery',
    version: env.VERSION,
  },
  subCommands: {
    bridge: bridgeCommand,
    connection: connectionCommand,
    help: defineCommand({
      meta: { hidden: true, name: 'tamery' },
      run: () => printHelp(main),
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
    query: defineCommand({
      args: queryArgs,
      meta: {
        description: 'Run a statement on a connection, read-only by default',
        name: 'tamery query',
      },
      run: exitingWhenDone<typeof queryArgs>(({ args }) => query(args)),
    }),
    update: defineCommand({
      meta: {
        description: 'Update the CLI the way you installed it',
        name: 'tamery update',
      },
      run: reportingErrors(update),
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

// Each name is the full command line, which the help prints as it is.
await runMain(main, {
  showUsage: async (command) => {
    await printHelp(command)
    // citty prints a usage error with a bare `console.error` right after the help; help itself exits before any.
    console.error = (message: unknown) => log.error(String(message))
  },
})
