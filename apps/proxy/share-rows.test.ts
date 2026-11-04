import { afterEach, expect, mock, spyOn, test } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'
import { ShareRefresh } from '@tamery/shared/enums/share-refresh'
import type { ShareView } from '@tamery/shared/share'

import { readCachedShareRows } from './share-rows'

afterEach(() => mock.restore())

test('PostHog pages come from one read that never sends an OFFSET', async () => {
  const fetched = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      columns: ['n'],
      results: Array.from({ length: 150 }, (_, n) => [n]),
    })
  )
  const share = {
    id: 'share',
    maxRows: 150,
    refresh: ShareRefresh.Hour,
    updatedAt: new Date(0),
  }
  const read = {
    connectionString: 'posthog://:phx_key@8.8.8.8/1',
    dialect: Dialect.PostHog,
    view: {
      columns: [{ id: 'n' }],
      filters: [],
      orderBy: {},
      schema: 'public',
      table: 'events',
    } as unknown as ShareView,
  }

  const first = await readCachedShareRows(share, {
    ...read,
    limit: 101,
    offset: 0,
  })
  const second = await readCachedShareRows(share, {
    ...read,
    limit: 101,
    offset: 100,
  })

  expect(first.rows).toHaveLength(101)
  expect(second.rows).toHaveLength(50)
  expect(second.rows[0]).toEqual([100])
  expect(fetched).toHaveBeenCalledTimes(1)
  const { query } = JSON.parse(String(fetched.mock.calls[0]?.[1]?.body)).query
  expect(query).toContain('limit 150')
  expect(query).not.toContain('offset')
})
