import { createRequire } from 'node:module'

import { logDriverError } from '@tamery/shared/sanitize-log'
import { Result } from 'better-result'
import { memoize } from 'memoza'
import type { PoolConfig } from 'pg'
import type * as PgModule from 'pg'

import { getDriverConfig } from '../../../parse-connection-string'
import { readSSLFiles } from '../../../read-ssl-files'
import { sshForwarding } from '../../../ssh/forwarding'
import { defaultSSLConfig, parseSSLConfig } from '../../../ssl/pg'

export const pg = createRequire(import.meta.url)('pg') as typeof PgModule

const POINT_OID = 600
// oxlint-disable-next-line ts/no-inferrable-types -- widened: `TypeId` rejects a literal OID missing from builtins
const TEXT_ARRAY_OID: number = 1009
const asTextArray = pg.types.getTypeParser(TEXT_ARRAY_OID)

// Edited cells write this text back verbatim — the default parsers return a Date, object or Buffer Postgres can't re-parse.
const OIDS_KEPT_AS_POSTGRES_TEXT: [oid: number, arrayOid: number][] = [
  [pg.types.builtins.BYTEA, 1001],
  [pg.types.builtins.CIRCLE, 719],
  [pg.types.builtins.DATE, 1182],
  [pg.types.builtins.INTERVAL, 1187],
  [POINT_OID, 1017],
  [pg.types.builtins.TIME, 1183],
  [pg.types.builtins.TIMESTAMP, 1115],
  [pg.types.builtins.TIMESTAMPTZ, 1185],
  [pg.types.builtins.TIMETZ, 1270],
]

for (const [oid, arrayOid] of OIDS_KEPT_AS_POSTGRES_TEXT) {
  pg.types.setTypeParser(oid, (value: string) => value)
  pg.types.setTypeParser(arrayOid, asTextArray)
}

const connect = (options: PoolConfig) =>
  Result.tryPromise({
    catch: (error) => error,
    try: async () => {
      const pool = new pg.Pool(options)
      pool.on('error', logDriverError)
      await pool.query('SELECT 1')
      return pool
    },
  })

// pg gives this refusal no code, only the message.
const refusesTls = (error: unknown) =>
  error instanceof Error &&
  error.message === 'The server does not support SSL connections'

export const getPool = memoize(async (connectionString: string) => {
  const { password, searchParams, ...config } =
    getDriverConfig(connectionString)
  const ssl = parseSSLConfig(searchParams)
  const tunnel = await sshForwarding.of(connectionString)
  const conf: PoolConfig = {
    ...config,
    ...(tunnel && { stream: tunnel.socket }),
    connectionTimeoutMillis: 30_000,
    max: 1,
    // Only a function keeps pg from falling back to `PGPASSWORD` and `~/.pgpass`, handing the user's stored password to
    // whatever host the string names (an MCP agent's included).
    password: () => password ?? '',
    // A database can default this off, making `\'` close a string: `readsOnly`, the tokenizer and Kysely's `sql.lit` all assume it is on.
    options: '-c standard_conforming_strings=on',
    ssl:
      typeof ssl === 'object' ? readSSLFiles(ssl) : (ssl ?? defaultSSLConfig),
  }

  const secure = await connect(conf)
  const result =
    ssl === undefined && secure.isErr() && refusesTls(secure.error)
      ? await connect({ ...conf, ssl: false })
      : secure

  if (result.isErr()) {
    throw result.error
  }
  return result.value
})
