import { once } from 'node:events'
import { createRequire } from 'node:module'
import type net from 'node:net'

import { logDriverError } from '@tamery/shared/sanitize-log'
import { memoize } from 'memoza'
import type * as mssqlModule from 'mssql'

import { getDriverConfig } from '../../../parse-connection-string'
import { sshForwarding } from '../../../ssh/forwarding'
import { parseSSLConfig } from '../../../ssl/mssql'

export const mssql = createRequire(import.meta.url)(
  'mssql'
) as typeof mssqlModule

export const poolConfig = async (
  connectionString: string
): Promise<mssqlModule.config> => {
  const { database, host, password, port, searchParams, user } =
    getDriverConfig(connectionString)
  const tunnel = await sshForwarding.of(connectionString)
  return {
    database,
    options: {
      ...parseSSLConfig(searchParams),
      ...(tunnel && {
        connector: async () => {
          const socket = tunnel.socket()
          await once(socket, 'connect')
          // tedious types its socket as net.Socket but calls only the stream half and setKeepAlive, which the tunnel socket has.
          return socket as unknown as net.Socket
        },
      }),
    },
    password,
    pool: { max: 1 },
    port,
    requestTimeout: 0,
    server: host,
    user,
  }
}

export const getPool = memoize(async (connectionString: string) => {
  const pool = new mssql.ConnectionPool(await poolConfig(connectionString))
  pool.on('error', logDriverError)
  return pool.connect()
})
