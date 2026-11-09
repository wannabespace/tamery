import type { Expression, ExpressionBuilder } from 'kysely'
import { isExpression, sql } from 'kysely'

import type { ActiveFilter, FilterOperator } from './types'

export const SQL_OPERATORS: Record<Exclude<FilterOperator, 'sql'>, string> = {
  eq: '=',
  gt: '>',
  gte: '>=',
  ilike: 'ilike',
  in: 'in',
  isNotNull: 'is not null',
  isNull: 'is null',
  like: 'like',
  lt: '<',
  lte: '<=',
  ne: '!=',
  notIn: 'not in',
  notLike: 'not like',
}

export type FilterValueBinding = (column: string, value: unknown) => unknown

export interface FilterSpelling {
  bind?: FilterValueBinding
  /** The text found at `path` inside a JSON column, null when nothing is there. */
  jsonText: (column: string, path: string[]) => Expression<unknown>
}

const unbound: FilterValueBinding = (_, value) => value

const predicate = (
  column: string,
  { path, ref, values }: ActiveFilter,
  { bind = unbound, jsonText }: FilterSpelling
) => {
  if (ref.operator === 'sql') {
    return sql`(${sql.raw(String(values[0]))})`
  }
  const subject = path ? jsonText(column, path) : sql.id(column)
  const comparison = sql`${subject} ${sql.raw(SQL_OPERATORS[ref.operator])}`
  if (ref.hasValue === false) {
    return comparison
  }
  const valueOf = (value: unknown) => {
    const bound = path ? value : bind(column, value)
    return isExpression(bound) ? bound : sql.val(bound)
  }
  const value = ref.isArray
    ? sql`(${sql.join(values.map((item) => valueOf(String(item).trim())))})`
    : valueOf(values[0])
  return sql`${comparison} ${value}`
}

// oxlint-disable-next-line ts/no-explicit-any
export const toKyselyFilter = <E extends ExpressionBuilder<any, any>>(
  eb: E,
  filters: ActiveFilter[],
  concatOperator: 'AND' | 'OR',
  spelling: FilterSpelling
) =>
  (concatOperator === 'AND' ? eb.and : eb.or)(
    filters.map(({ via, ...filter }) =>
      via
        ? sql`${sql.id(filter.column)} in (select ${sql.id(via.key)} from ${sql.id(via.schema, via.table)} where ${predicate(via.target, filter, { jsonText: spelling.jsonText })})`
        : predicate(filter.column, filter, spelling)
    )
  )
