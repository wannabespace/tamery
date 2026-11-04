import { once } from 'node:events'
import https from 'node:https'
import { text } from 'node:stream/consumers'
import tls from 'node:tls'

import { type } from 'arktype'
import { Result } from 'better-result'
import { memoize } from 'memoza'

import type { RunOptions } from '../..'
import { resultSet } from '../..'
import type { Destination } from '../../../forwarding'
import { forwarding } from '../../../forwarding'
import { readConnectionString } from '../../../parse-connection-string'
import { cancellable } from '../../cancellation'

const answer = type({
  columns: 'string[]',
  'hasMore?': 'boolean | null',
  results: 'unknown[][]',
})

const refusal = type({ detail: 'string' })

// Through `forwarding`, like every driver: on the cloud proxy each socket dials an address checked just before, which a DNS rebind past `assertReachable` cannot dodge. `fetch` has no socket to give.
const getAgent = memoize(async (connectionString: string) => {
  const tunnel = await forwarding.of(connectionString)
  return tunnel
    ? Object.assign(new https.Agent({ keepAlive: true }), {
        createConnection: (options: tls.ConnectionOptions & Destination) =>
          tls.connect({ ...options, socket: tunnel.socketTo(options) }),
      })
    : undefined
})

const request = async (
  connectionString: string,
  path: string,
  { body, method }: { body?: string; method: 'DELETE' | 'POST' }
) => {
  const { database, host, password, port, searchParams } =
    readConnectionString(connectionString)
  if ([...searchParams.keys()].some((key) => key.startsWith('ssh_'))) {
    throw new Error('PostHog connections cannot use an SSH tunnel.')
  }
  const agent = await getAgent(connectionString)
  // A redirect is not followed, so it cannot carry a cloud proxy request past its public-host check: it reads as a refusal below.
  const sent = https.request(
    `https://${host}${port ? `:${port}` : ''}/api/projects/${encodeURIComponent(database)}/query/${path}`,
    {
      agent,
      headers: {
        Authorization: `Bearer ${password}`,
        'Content-Type': 'application/json',
      },
      method,
    }
  )
  const answered = once(sent, 'response')
  sent.end(body)
  const [response] = await answered.catch((error: Error) => {
    throw new Error(`Could not reach PostHog at ${host}: ${error.message}`)
  })
  const content = await text(response)
  const { statusCode = 0 } = response
  if (statusCode >= 200 && statusCode < 300) {
    return content
  }
  const failure = refusal(Result.try(() => JSON.parse(content)).unwrapOr(null))
  throw new Error(
    failure instanceof type.errors
      ? `PostHog answered ${statusCode}`
      : failure.detail
  )
}

export const runQuery = ({
  connectionString,
  maxRows = Number.POSITIVE_INFINITY,
  query,
  queryId,
}: {
  connectionString: string
  query: string
  values?: unknown[]
} & RunOptions) =>
  cancellable(
    {
      cancel: () =>
        request(connectionString, `${queryId}/`, { method: 'DELETE' }),
      connectionString,
      queryId,
    },
    async () => {
      const startedAt = performance.now()
      const content = await request(connectionString, '', {
        body: JSON.stringify({
          client_query_id: queryId,
          name: 'tamery',
          query: { kind: 'HogQLQuery', query },
          // PostHog's default serves a cached answer for hours, so a refresh would show old rows.
          refresh: 'force_blocking',
        }),
        method: 'POST',
      })
      const { columns, hasMore, results } = answer.assert(JSON.parse(content))
      const set = resultSet(
        { affectedRows: null, columns, rows: results },
        maxRows
      )
      return {
        duration: performance.now() - startedAt,
        result: [{ ...set, truncated: set.truncated || hasMore === true }],
      }
    }
  )
