// oxlint-disable-next-line unicorn/prefer-node-protocol -- ClickHouse types `http_agent` with `http`, which this program's two @types/node copies (ssh2's and bun's) keep apart from `node:http`
import http from 'http'
import https from 'node:https'
import { createRequire } from 'node:module'
import tls from 'node:tls'

import type * as ClickHouse from '@clickhouse/client'
import { SafeURL } from '@tamery/shared/safe-url'
import { memoize } from 'memoza'

import type { Destination } from '../../../forwarding'
import { forwarding } from '../../../forwarding'
import { deleteSshParams } from '../../../ssh/params'

const clickhouse = createRequire(import.meta.url)(
  '@clickhouse/client'
) as typeof ClickHouse

export const { parseError } = clickhouse

export const getClient = memoize(async (connectionString: string) => {
  const url = new SafeURL(connectionString)
  const tunnel = await forwarding.of(connectionString)
  deleteSshParams(url.searchParams)

  return clickhouse.createClient({
    clickhouse_settings: { date_time_output_format: 'iso' },
    // The agent's own host and port, not the form's: a URL that omits its port means 80 or 443 to the client, never 8123.
    ...(tunnel && {
      http_agent:
        url.protocol === 'https:'
          ? Object.assign(new https.Agent({ keepAlive: true }), {
              createConnection: (
                options: tls.ConnectionOptions & Destination
              ) =>
                tls.connect({ ...options, socket: tunnel.socketTo(options) }),
            })
          : Object.assign(new http.Agent({ keepAlive: true }), {
              createConnection: (options: Destination) =>
                tunnel.socketTo(options),
            }),
    }),
    request_timeout: 0,
    url: url.toString(),
  })
})
