import { describe, expect, test } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'

import type { Column } from '~/core/table/cell/utils'

import { withRowFieldColumns } from './row-field-columns'

const column = (id: string): Column => ({
  id,
  isEditable: false,
  isNullable: true,
  type: 'String',
  uiType: 'raw',
})

describe('withRowFieldColumns on PostHog', () => {
  const columns = [column('event'), column('team_id')]

  test('hides a catalog column SELECT * left out of the rows', () => {
    expect(
      withRowFieldColumns(Dialect.PostHog, columns, [{ event: 'a' }]).map(
        ({ id }) => id
      )
    ).toEqual(['event'])
  })

  test('keeps a column whose value is null', () => {
    expect(
      withRowFieldColumns(Dialect.PostHog, columns, [
        { event: null, team_id: null },
      ])
    ).toEqual(columns)
  })

  test('shows the catalog while there are no rows to go by', () => {
    expect(withRowFieldColumns(Dialect.PostHog, columns, [])).toEqual(columns)
  })
})
