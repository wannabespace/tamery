import { AI_SQL_LIMITS } from '@tamery/ai/limits'
import type { SqlCatalog } from '@tamery/sql'

const noted = (text: string, comment?: string | null) =>
  comment ? `${text} /* ${comment.replaceAll(/\s+/gu, ' ')} */` : text

export const catalogSummary = (catalog: SqlCatalog) => {
  const tables = catalog.schemas.flatMap((schema) =>
    schema.tables.map((table) => ({
      line: noted(
        `${schema.name}.${table.name}${table.columns ? `(${table.columns.map((column) => noted(`${column.name} ${column.type}`, column.comment)).join(', ')})` : ''}`,
        table.comment
      ),
      loaded: table.columns !== null,
    }))
  )
  const lines = [
    ...tables.filter((table) => table.loaded).map((table) => table.line),
    ...tables.filter((table) => !table.loaded).map((table) => table.line),
    ...catalog.enums.map(
      (item) => `enum ${item.name}: ${item.values.join(', ')}`
    ),
  ]
  const kept: string[] = []
  let length = 0
  for (const line of lines) {
    length += line.length + 1
    if (length > AI_SQL_LIMITS.context) {
      break
    }
    kept.push(line)
  }
  return kept.join('\n')
}
