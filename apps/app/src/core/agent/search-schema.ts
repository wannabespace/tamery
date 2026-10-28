import { resourceColumnsQueryOptions } from '~/core/queries/tables/columns'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'

import type { AgentTarget } from './target'
import { fetchForAgent, resolveResource } from './target'

const SEARCH_LIMIT = 50

/** Tables and columns whose name or comment holds any word of `query`, so a database of hundreds of tables needs no full listing. */
export const searchSchema = async ({
  query,
  ...target
}: AgentTarget & { query: string }) => {
  const { resource: connectionResource } = resolveResource(target)
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean)
  const matches = (...texts: (string | null | undefined)[]) =>
    terms.some((term) =>
      texts.some((text) => text?.toLowerCase().includes(term))
    )
  const [{ schemas }, columns] = await Promise.all([
    fetchForAgent(resourceTablesAndSchemasQueryOptions({ connectionResource })),
    fetchForAgent(resourceColumnsQueryOptions({ connectionResource })),
  ])
  const tables = schemas.flatMap((schema) =>
    schema.tables
      .filter((table) => matches(table.name, table.comment))
      .map((table) => ({
        comment: table.comment,
        schema: schema.name,
        table: table.name,
        type: table.type,
      }))
  )
  const matchedColumns = columns
    .filter((column) => matches(column.id, column.comment))
    .map((column) => ({
      column: column.id,
      comment: column.comment,
      schema: column.schema,
      table: column.table,
      type: column.typeLabel,
    }))
  return {
    columns: matchedColumns.slice(0, SEARCH_LIMIT),
    tables: tables.slice(0, SEARCH_LIMIT),
    truncated:
      matchedColumns.length > SEARCH_LIMIT || tables.length > SEARCH_LIMIT,
  }
}
