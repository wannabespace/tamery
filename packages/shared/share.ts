import { type } from 'arktype'

import { columnKind } from './column-kind'
import { Dialect } from './enums/connection-type'
import { ShareRefresh } from './enums/share-refresh'
import { activeFilter } from './filters'

export const SHARE_PAGE_SIZE = 100
export const SHARE_MAX_PAGES = 100
export const SHARE_MAX_ROWS = SHARE_PAGE_SIZE * SHARE_MAX_PAGES
export const SHARE_PASSWORD_MIN_LENGTH = 6

export const SHARE_ROW_LIMITS = [100, 500, 1000, 5000, SHARE_MAX_ROWS] as const

export const sharePage = type(`1 <= number.integer <= ${SHARE_MAX_PAGES}`)
export const shareMaxRows = type(`1 <= number.integer <= ${SHARE_MAX_ROWS}`)

const orderDirection = type('"ASC" | "DESC"')

export const shareToken = type('string.hex == 64')

export const shareAccessErrors = {
  LOCKED: { message: 'This table needs a password.' },
  NOT_FOUND: { message: 'This table is not shared anymore.' },
}

export const shareUnlockErrors = {
  NOT_FOUND: shareAccessErrors.NOT_FOUND,
  TOO_MANY_ATTEMPTS: {
    message: 'Too many wrong passwords. Try again in a few minutes.',
  },
  WRONG_PASSWORD: { message: 'That password is not right.' },
}

const shareView = type({
  /** The type of every column in the table, which ClickHouse and SQLite bind filter values by. */
  columnTypes: type({ id: 'string', type: 'string' }).array(),
  /** The shown columns, in their order. */
  columns: type({ id: 'string', kind: columnKind, type: 'string | null' })
    .array()
    .atLeastLength(1),
  filters: activeFilter.array(),
  orderBy: { '[string]': orderDirection },
  schema: 'string',
  table: 'string',
})

export type ShareView = typeof shareView.infer

export const shareCheckInput = shareView.merge({
  dialect: type.valueOf(Dialect),
  resourceId: 'string.uuid',
})

export const shareSaveInput = shareView.merge({
  connectionResourceId: 'string.uuid',
  description: 'string | null',
  expiresAt: 'Date | null',
  /** Left out creates a new share. */
  'id?': 'string.uuid',
  maxRows: shareMaxRows,
  name: 'string > 0',
  /** Left out keeps the current password; `null` removes it. */
  'password?': `string >= ${SHARE_PASSWORD_MIN_LENGTH} | null`,
  refresh: type.valueOf(ShareRefresh),
})
