import { matchesSearch } from '@tamery/shared/utils'

import type { tablesAndSchemasType } from '~/core/queries/tables/list'

interface TableInfo {
  name: string
  rowLevelSecurity?: boolean
  type: (typeof tablesAndSchemasType.infer)['type']
}

export type TreeRow =
  | {
      kind: 'schema'
      id: string
      name: string
      open: boolean
    }
  | {
      kind: 'table'
      id: string
      schema: string
      table: TableInfo
      pinned: boolean
    }
  | { kind: 'empty'; id: string }
  | { kind: 'new-schema'; id: string }
  | { kind: 'separator'; id: string }

export const buildTreeRows = ({
  openedSchemas,
  pinnedTables,
  schemas,
  search,
  showSchemaRows,
}: {
  openedSchemas: string[]
  pinnedTables: { schema: string; table: string }[]
  schemas: {
    name: string
    tables: TableInfo[]
  }[]
  search?: string
  showSchemaRows: boolean
}) => {
  const pinnedSet = new Set(pinnedTables.map((t) => `${t.schema}:${t.table}`))
  const rows: TreeRow[] = []

  for (const schema of schemas) {
    const tables = schema.tables
      .filter((table) => matchesSearch(search, table.name))
      .toSorted((a, b) => a.name.localeCompare(b.name))

    if (search && tables.length === 0) {
      continue
    }

    const open =
      !showSchemaRows || !!search || openedSchemas.includes(schema.name)

    if (showSchemaRows) {
      rows.push({
        id: `schema:${schema.name}`,
        kind: 'schema',
        name: schema.name,
        open,
      })
    }

    if (!open) {
      continue
    }

    if (showSchemaRows && tables.length === 0) {
      rows.push({ id: `empty:${schema.name}`, kind: 'empty' })
      continue
    }

    const pinned = tables.filter((table) =>
      pinnedSet.has(`${schema.name}:${table.name}`)
    )
    const unpinned = tables.filter(
      (table) => !pinnedSet.has(`${schema.name}:${table.name}`)
    )

    for (const table of pinned) {
      rows.push({
        id: `table:${schema.name}:${table.name}`,
        kind: 'table',
        pinned: true,
        schema: schema.name,
        table,
      })
    }

    if (pinned.length > 0 && unpinned.length > 0) {
      rows.push({ id: `separator:${schema.name}`, kind: 'separator' })
    }

    for (const table of unpinned) {
      rows.push({
        id: `table:${schema.name}:${table.name}`,
        kind: 'table',
        pinned: false,
        schema: schema.name,
        table,
      })
    }
  }

  if (showSchemaRows && !search && rows.length > 0) {
    rows.push({ id: 'new-schema', kind: 'new-schema' })
  }

  return rows
}
