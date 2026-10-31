import { createRequire } from 'node:module'

import { Result } from 'better-result'
import { memoize } from 'memoza'
import type { PoolOptions } from 'mysql2'
import type * as mysql2Promise from 'mysql2/promise'

import { forwarding } from '../../../forwarding'
import { getDriverConfig } from '../../../parse-connection-string'
import { readSSLFiles } from '../../../read-ssl-files'
import { defaultSSLConfig, parseSSLConfig } from '../../../ssl/mysql'

export const mysql2 = createRequire(import.meta.url)(
  'mysql2/promise'
) as typeof mysql2Promise

const connect = (conf: PoolOptions) =>
  Result.tryPromise({
    catch: (error) => error,
    try: async () => {
      const pool = mysql2.createPool(conf)
      await pool.query('SELECT 1')
      return { conf, pool }
    },
  })

const refusesTls = (error: unknown) =>
  (error as { code?: string }).code === 'HANDSHAKE_NO_SSL_SUPPORT'

export const getPool = memoize(async (connectionString: string) => {
  const { searchParams, ...config } = getDriverConfig(connectionString)
  const ssl = parseSSLConfig(searchParams)
  const tunnel = await forwarding.of(connectionString)
  const conf: PoolOptions = {
    ...config,
    // mysql2 keeps an idle connection forever by default, and it would hold the tunnel's SSH session open with it.
    ...(tunnel && { maxIdle: 0, stream: tunnel.socket }),
    connectionLimit: 1,
    dateStrings: true,
    supportBigNumbers: true,
    ...(ssl !== false && { ssl: readSSLFiles(ssl ?? defaultSSLConfig) }),
  }

  const secure = await connect(conf)
  const result =
    ssl === undefined && secure.isErr() && refusesTls(secure.error)
      ? await connect({ ...conf, ssl: undefined })
      : secure
  if (result.isErr()) {
    throw result.error
  }
  return result.value
})
