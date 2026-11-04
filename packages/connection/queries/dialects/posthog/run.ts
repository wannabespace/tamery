import { type } from 'arktype'

import type { RunOptions } from '../..'
import { resultSet } from '../..'
import { readConnectionString } from '../../../parse-connection-string'
import { cancellable } from '../../cancellation'

const answer = type({
  columns: 'string[]',
  'hasMore?': 'boolean | null',
  results: 'unknown[][]',
})

const refusal = type({ detail: 'string' })

const request = async (
  connectionString: string,
  path: string,
  init: RequestInit
) => {
  const { database, host, password, port, searchParams } =
    readConnectionString(connectionString)
  if ([...searchParams.keys()].some((key) => key.startsWith('ssh_'))) {
    throw new Error('PostHog connections cannot use an SSH tunnel.')
  }
  const response = await fetch(
    `https://${host}${port ? `:${port}` : ''}/api/projects/${encodeURIComponent(database)}/query/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${password}`,
        'Content-Type': 'application/json',
      },
      // The host comes from the string, so a redirect must not carry a cloud proxy request past its public-host check.
      redirect: 'error',
    }
  )
  if (response.ok) {
    return response
  }
  const failure = refusal(await response.json().catch(() => null))
  throw new Error(
    failure instanceof type.errors
      ? `PostHog answered ${response.status}`
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
      const response = await request(connectionString, '', {
        body: JSON.stringify({
          client_query_id: queryId,
          name: 'tamery',
          query: { kind: 'HogQLQuery', query },
          // PostHog's default serves a cached answer for hours, so a refresh would show old rows.
          refresh: 'force_blocking',
        }),
        method: 'POST',
      })
      const { columns, hasMore, results } = answer.assert(await response.json())
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
