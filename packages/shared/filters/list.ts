import type { ArkError } from 'arktype'
import { type } from 'arktype'

import type { Filter, FilterGroup } from './types'

export const EQUAL_FILTER = {
  label: 'Equal',
  operator: 'eq',
  symbol: '=',
} as const satisfies Filter

export const IN_FILTER = {
  isArray: true,
  label: 'In',
  operator: 'in',
  symbol: 'IN',
} as const satisfies Filter

export const IS_NULL_FILTER = {
  hasValue: false,
  label: 'Is null',
  operator: 'isNull',
  symbol: 'IS NULL',
} as const satisfies Filter

/** A raw `WHERE` condition, the one value; never offered as an operator or to AI. */
export const SQL_FILTER = {
  label: 'SQL',
  operator: 'sql',
  symbol: 'WHERE',
} as const satisfies Filter

export const FILTERS_GROUPED = [
  {
    filters: [
      EQUAL_FILTER,
      { label: 'Not equal', operator: 'ne', symbol: '!=' },
      { label: 'Greater than', operator: 'gt', symbol: '>' },
      { label: 'Greater than or equal', operator: 'gte', symbol: '>=' },
      { label: 'Less than', operator: 'lt', symbol: '<' },
      { label: 'Less than or equal', operator: 'lte', symbol: '<=' },
    ],
    group: 'comparison',
  },
  {
    filters: [
      { label: 'Like', operator: 'like', symbol: 'LIKE' },
      { label: 'Ilike', operator: 'ilike', symbol: 'ILIKE' },
      { label: 'Not like', operator: 'notLike', symbol: 'NOT LIKE' },
    ],
    group: 'text',
  },
  {
    filters: [
      IN_FILTER,
      { isArray: true, label: 'Not in', operator: 'notIn', symbol: 'NOT IN' },
    ],
    group: 'list',
  },
  {
    filters: [
      IS_NULL_FILTER,
      {
        hasValue: false,
        label: 'Is not null',
        operator: 'isNotNull',
        symbol: 'IS NOT NULL',
      },
    ],
    group: 'null',
  },
] as const satisfies {
  group: FilterGroup
  filters: Filter[]
}[]

// oxlint-disable-next-line unicorn/prefer-array-flat-map -- flatMap widens the `as const` tuple union and breaks Filter typing
export const FILTERS_LIST = FILTERS_GROUPED.map((group) => group.filters).flat()

export const FILTER_OPERATORS = FILTERS_LIST.map((filter) => filter.operator)

// Only the operator is read: the rest of `ref` decides how values reach SQL, so it is always the canonical filter.
export const activeFilter = type({
  column: 'string',
  'disabled?': 'boolean',
  ref: type({ operator: 'string' }).pipe(
    ({ operator }, ctx): Filter | ArkError =>
      [...FILTERS_LIST, SQL_FILTER].find(
        (filter) => filter.operator === operator
      ) ??
      ctx.error('a known filter operator')
  ),
  'path?': 'string[]',
  values: 'unknown[]',
  'via?': {
    key: 'string',
    schema: 'string',
    table: 'string',
    target: 'string',
  },
})
