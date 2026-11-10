export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'notLike'
  | 'in'
  | 'notIn'
  | 'isNull'
  | 'isNotNull'
  | 'sql'

export interface Filter {
  label: string
  operator: FilterOperator
  symbol: string
  isArray?: boolean
  hasValue?: boolean
}

export interface FilterVia {
  key: string
  schema: string
  table: string
  target: string
}

export type JsonPath = (string | number)[]

export interface ActiveFilter<F extends Filter = Filter, V = unknown> {
  column: string
  ref: F
  values: V[]
  disabled?: boolean
  /** Steps into a JSON value, compared as text: a string is an object key, a number an array index. */
  path?: JsonPath
  via?: FilterVia
}

export const enabledFilters = <T extends { disabled?: boolean }>(
  filters: T[]
): T[] => filters.filter((filter) => !filter.disabled)

export const FILTER_GROUPS = {
  comparison: 'Comparison',
  list: 'List Operations',
  null: 'Null Checks',
  text: 'Text Search',
} as const

export type FilterGroup = keyof typeof FILTER_GROUPS
