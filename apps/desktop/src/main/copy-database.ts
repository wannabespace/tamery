import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { Forwarding } from '@tamery/connection/forwarding'
import { forwarding } from '@tamery/connection/forwarding'
import { getDriverConfig } from '@tamery/connection/parse-connection-string'
import { getPool } from '@tamery/connection/queries/dialects/pg/client'
import { getLibpqSslMode } from '@tamery/connection/ssl/pg'
import { Dialect } from '@tamery/shared/enums/connection-type'
import { silently, toError } from '@tamery/shared/utils'
import { quoteIdentifier } from '@tamery/sql/identifier'
import { Result } from 'better-result'

export interface CopyDatabaseRequest {
  id: string
  source: string
  target: string
  /** `null` copies the whole database: every schema, type, function and view, not only tables. */
  tables: { schema: string; table: string }[] | null
}

type Tool = 'pg_dump' | 'psql'

// Packaged by `scripts/todesktop-after-pack.cjs`; Linux and dev builds have none and run the user's own from PATH.
const BUNDLED_TOOLS = path.join(process.resourcesPath, 'postgres', 'bin')

const POSTGRES_17 = 170_000
// pg_dump 17+ writes this into every dump's header, and older servers refuse the whole transaction over it.
const TRANSACTION_TIMEOUT = Buffer.from('SET transaction_timeout = 0;')
const HEADER_BYTES = 4096
const COMMIT = Buffer.from('COMMIT;\n')
const KEEPALIVES =
  '--dbname=keepalives_idle=10 keepalives_interval=5 keepalives_count=3'

/** libpq dials a TCP port, while a tunnel opens none, so the copy gets a loopback listener for its length. */
const listenLocally = async (tunnel: Forwarding) => {
  const server = createServer((local) => {
    void silently(() => pipeline(local, tunnel.socket(), local))
  })
  await once(server.listen(0, '127.0.0.1'), 'listening')
  // A TCP server listening on a port answers with AddressInfo, never a pipe name.
  const { port } = server.address() as AddressInfo
  return { close: () => server.close(), port }
}

/** The app's own pool connects first: it opens the tunnel, asks about an unknown host key and settles the TLS fallback the tools then reuse. */
const openEndpoint = async (connectionString: string) => {
  const { database, host, password, port, searchParams, user } =
    getDriverConfig(connectionString)
  // libpq takes a key's passphrase only from a connection string or a service file, which would put it in argv or on disk.
  if (searchParams.get('sslpassword')) {
    throw new Error(
      'Copy database cannot use a client key protected by a passphrase yet.'
    )
  }
  const pool = await getPool(connectionString)
  const { rows } = await pool.query<{ server_version_num: string }>(
    'SHOW server_version_num'
  )
  // pg_control_system() is 9.6+, and a provider may revoke it.
  const identity = await Result.tryPromise(() =>
    pool.query<{ database: string }>(
      "SELECT system_identifier || '/' || current_database() AS database FROM pg_control_system()"
    )
  )
  const tunnel = await forwarding.of(connectionString)
  const local = tunnel ? await listenLocally(tunnel) : null
  const sslMode = getLibpqSslMode(pool.options.ssl, searchParams.get('sslmode'))
  return {
    [Symbol.dispose]: () => local?.close(),
    database: identity.unwrapOr(null)?.rows[0]?.database ?? null,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))
      ),
      PGAPPNAME: 'Tamery',
      PGCONNECT_TIMEOUT: '30',
      PGDATABASE: database,
      PGHOST: host,
      // libpq dials the address and still checks the certificate against the host.
      PGHOSTADDR: local ? '127.0.0.1' : undefined,
      PGPASSWORD: password,
      PGPORT: local ? String(local.port) : port?.toString(),
      PGSSLCERT: searchParams.get('sslcert') ?? undefined,
      PGSSLKEY: searchParams.get('sslkey') ?? undefined,
      PGSSLMODE: sslMode,
      PGSSLROOTCERT:
        searchParams.get('sslrootcert') ??
        (sslMode === 'verify-full' ? 'system' : undefined),
      PGUSER: user,
    },
    version: Number(rows[0]?.server_version_num),
  }
}

const toolPath = (tool: Tool) =>
  existsSync(BUNDLED_TOOLS) ? path.join(BUNDLED_TOOLS, tool) : tool

const watchTool = async (
  tool: Tool,
  child: ChildProcess & { stderr: Readable },
  log: (line: string) => void
) => {
  let lastError: string | null = null
  createInterface({ input: child.stderr }).on('line', (line) => {
    if (/error:/iu.test(line)) {
      lastError = line
    } else if (lastError && line.startsWith('DETAIL:')) {
      lastError = `${lastError}\n${line}`
    }
    log(line)
  })
  const closed = await Result.tryPromise(() => once(child, 'close'))
  if (closed.isErr()) {
    const error = toError(closed.error.cause)
    throw 'code' in error && error.code === 'ENOENT'
      ? new Error(
          `${tool} was not found. Install the PostgreSQL client tools to copy databases.`
        )
      : error
  }
  const [code] = closed.value
  if (code !== 0) {
    throw new Error(lastError ?? `${tool} stopped with code ${code}`)
  }
}

const strip = (bytes: Buffer) => {
  const at = bytes.indexOf(TRANSACTION_TIMEOUT)
  return at === -1
    ? bytes
    : Buffer.concat([
        bytes.subarray(0, at),
        bytes.subarray(at + TRANSACTION_TIMEOUT.length),
      ])
}

/** Holds the end of the dump until pg_dump has exited, so only a complete dump commits; any other end leaves the transaction open and psql's exit rolls it back. */
const commitAfter = (dumped: Promise<void>, stripHeader: boolean) => {
  let header: Buffer | null = stripHeader ? Buffer.alloc(0) : null
  return new Transform({
    flush: async (done) => {
      const result = await Result.tryPromise(() => dumped)
      if (result.isErr()) {
        done(toError(result.error.cause))
        return
      }
      done(null, header ? Buffer.concat([strip(header), COMMIT]) : COMMIT)
    },
    transform: (chunk: Buffer, _encoding, done) => {
      if (!header) {
        done(null, chunk)
        return
      }
      header = Buffer.concat([header, chunk])
      if (header.length < HEADER_BYTES) {
        done()
        return
      }
      const stripped = strip(header)
      header = null
      done(null, stripped)
    },
  })
}

export const copyDatabase = async (
  { source, tables, target }: CopyDatabaseRequest,
  log: (line: string) => void,
  signal: AbortSignal
) => {
  using from = await openEndpoint(source)
  using to = await openEndpoint(target)
  if (from.database !== null && from.database === to.database) {
    throw new Error(
      'The target is the source database, reached through another connection. Choose another one.'
    )
  }
  const dump = spawn(
    toolPath('pg_dump'),
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--verbose',
      KEEPALIVES,
      ...(tables ?? []).map(
        ({ schema, table }) =>
          `--table-and-children=${quoteIdentifier(schema, Dialect.Postgres)}.${quoteIdentifier(table, Dialect.Postgres)}`
      ),
    ],
    { env: from.env, signal, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const restore = spawn(
    toolPath('psql'),
    ['--no-psqlrc', '--quiet', '--set=ON_ERROR_STOP=1', KEEPALIVES],
    { env: to.env, signal, stdio: ['pipe', 'ignore', 'pipe'] }
  )
  const dumped = watchTool('pg_dump', dump, log)
  restore.stdin.write(
    [
      // Not PGOPTIONS: PgBouncer refuses the startup `options` parameter. Before BEGIN, or a rollback resets them and the server keeps a dead client's locks for hours.
      'SET tcp_keepalives_idle = 10;',
      'SET tcp_keepalives_interval = 5;',
      'SET tcp_keepalives_count = 3;',
      'BEGIN;',
      ...Array.from(
        new Set(tables?.map(({ schema }) => schema)),
        (schema) =>
          `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema, Dialect.Postgres)};`
      ),
      '',
    ].join('\n')
  )
  // psql's failure first: once it stops, pg_dump only reports the broken pipe.
  const results = await Promise.allSettled([
    watchTool('psql', restore, log),
    dumped,
    pipeline(
      dump.stdout,
      commitAfter(dumped, to.version < POSTGRES_17),
      restore.stdin
    ),
  ])
  for (const result of results) {
    if (result.status === 'rejected') {
      throw result.reason
    }
  }
}
