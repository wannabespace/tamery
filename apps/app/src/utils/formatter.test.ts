import { describe, expect, test } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'

import { formatSql } from './formatter'

describe('formatSql on HogQL', () => {
  test('lays out a query holding $ names and keeps its case-sensitive names', () => {
    expect(
      formatSql(
        "select event, properties.$browser as b, $session_id from events where event = '$pageview' and {filters} limit 1",
        Dialect.PostHog
      )
    ).toBe(`select
  event,
  properties.$browser as b,
  $session_id
from
  events
where
  event = '$pageview'
  and {filters}
limit
  1`)
  })
})
