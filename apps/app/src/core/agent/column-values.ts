import { getDialect } from '@tamery/shared/enums/connection-type'
import { toToolOutput } from '@tamery/shared/tool-output'

import { columnStatsQuery } from '~/core/queries/rows/column-stats'
import { valueCountsQuery } from '~/core/queries/rows/value-counts'
import { resourceTableColumnsQueryOptions } from '~/core/queries/tables/columns'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { getColumnUiType, isNumericColumn } from '~/core/table/cell/utils'

import type { AgentTarget } from './target'
import { fetchForAgent, resolveResource } from './target'

const TOP_VALUES = 50
const RANGED_UI_TYPES = new Set(['date', 'datetime', 'time'])

/** The most common values of one column with their counts, plus min and max for numbers and dates: what a filter should compare against, instead of a guess at `'paid'` or `'PAID'`. */
export const columnValues = async ({
  column,
  schema,
  table,
  ...target
}: AgentTarget & { column: string; schema: string; table: string }) => {
  const { connection, resource: connectionResource } = resolveResource(target)
  const columns = await fetchForAgent(
    resourceTableColumnsQueryOptions({ connectionResource, schema, table })
  )
  const found = columns.find(({ id }) => id === column)
  if (!found) {
    throw new Error(
      `No column "${column}" in "${schema}"."${table}". Call describe_table for its columns.`
    )
  }
  const uiType = getColumnUiType(getDialect(connection.type), found)
  const ranged =
    isNumericColumn({ ...found, uiType }) || RANGED_UI_TYPES.has(uiType)
  const params = await connectionResourceToQueryParams(connectionResource)
  const query = { column, columns, filters: [], schema, table }
  const [stats, counts] = await Promise.all([
    columnStatsQuery({ ...query, ranged }).run(params),
    valueCountsQuery({ ...query, limit: TOP_VALUES, term: '' }).run(params),
  ])
  const [values] = toToolOutput([
    {
      rows: counts.map(({ count, value }) => [value, count]),
      truncated: stats.unique > counts.length,
    },
  ])
  const [range] = toToolOutput([
    { rows: ranged ? [[stats.min, stats.max]] : [], truncated: false },
  ])
  return {
    distinct: stats.unique,
    max: range?.rows[0]?.[1] ?? null,
    min: range?.rows[0]?.[0] ?? null,
    nulls: stats.total - stats.filled,
    rows: stats.total,
    values: (values?.rows ?? []).map(([value, count]) => ({ count, value })),
    valuesTruncated: values?.truncated ?? false,
  }
}
