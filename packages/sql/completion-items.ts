import type { SqlCatalog, SqlTable } from './catalog'
import type { DialectSpec } from './dialect'
import { scopeTable } from './resolve'
import type { StatementScope } from './scope'

export type CompletionKind =
  | 'column'
  | 'enum'
  | 'function'
  | 'keyword'
  | 'operator'
  | 'schema'
  | 'table'
  | 'value'
  | 'view'

export interface CompletionItem {
  label: string
  kind: CompletionKind
  insertText: string
  detail?: string
  sortText: string
  snippet?: true
}

const KEYWORD_PRIORITY = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT',
  'INNER',
  'ON',
  'GROUP',
  'ORDER',
  'BY',
  'LIMIT',
  'AND',
  'OR',
  'AS',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'WITH',
  'CREATE',
  'ALTER',
  'DROP',
]

const PLAIN_NAMES = {
  lower: /^[a-z_][a-z\d_$]*$/u,
  upper: /^[A-Z_][A-Z\d_$#]*$/u,
}

export const quoteIfNeeded = (catalog: SqlCatalog, name: string) =>
  catalog.nameCase && !PLAIN_NAMES[catalog.nameCase].test(name)
    ? `"${name.replaceAll('"', '""')}"`
    : name

export const columnItems = (
  catalog: SqlCatalog,
  table: SqlTable,
  { detail = '', qualifier = '' }: { detail?: string; qualifier?: string } = {}
): CompletionItem[] =>
  (table.columns ?? []).map((column) => {
    const name = qualifier ? `${qualifier}.${column.name}` : column.name
    const inserted = quoteIfNeeded(catalog, column.name)
    return {
      detail: `${detail}${column.type}${column.nullable ? '' : ' not null'}`,
      insertText: qualifier
        ? `${quoteIfNeeded(catalog, qualifier)}.${inserted}`
        : inserted,
      kind: 'column',
      label: name,
      sortText: `1${name}`,
    }
  })

export const tableItems = (catalog: SqlCatalog): CompletionItem[] =>
  catalog.schemas.flatMap((schema) =>
    schema.tables.map((table) => {
      const inDefault = schema.name === catalog.defaultSchema
      const qualified = inDefault ? table.name : `${schema.name}.${table.name}`
      const inserted = quoteIfNeeded(catalog, table.name)
      return {
        detail: `${table.kind} · ${schema.name}`,
        insertText: inDefault
          ? inserted
          : `${quoteIfNeeded(catalog, schema.name)}.${inserted}`,
        kind: table.kind === 'view' ? 'view' : 'table',
        label: qualified,
        sortText: `2${qualified}`,
      }
    })
  )

export const keywordItems = (dialect: DialectSpec): CompletionItem[] =>
  [...dialect.keywords].map((keyword) => {
    const priority = KEYWORD_PRIORITY.indexOf(keyword)
    return {
      insertText: keyword,
      kind: 'keyword',
      label: keyword,
      sortText: `4${(priority === -1 ? 99 : priority).toString().padStart(2, '0')}${keyword}`,
    }
  })

export const functionItems = (dialect: DialectSpec): CompletionItem[] =>
  [...dialect.functions].map((name) => ({
    insertText: `${name}($1)`,
    kind: 'function',
    label: name,
    snippet: true,
    sortText: `5${name}`,
  }))

export const orderedItems = (
  items: {
    label: string
    insertText?: string
    detail?: string
    kind?: CompletionKind
    snippet?: true
  }[],
  kind: CompletionKind,
  rank = '0'
): CompletionItem[] =>
  items.map((item, index) => ({
    detail: item.detail,
    insertText: item.insertText ?? item.label,
    kind: item.kind ?? kind,
    label: item.label,
    snippet: item.snippet,
    sortText: `${rank}${index.toString().padStart(2, '0')}`,
  }))

export const scopeColumnItems = (
  scope: StatementScope,
  catalog: SqlCatalog
): CompletionItem[] => {
  const own = scope.visible.slice(scope.enclosing.length)
  const local = own.length > 0 ? own : scope.enclosing
  const known = [...own, ...scope.enclosing].flatMap((ref) => {
    const table = scopeTable(scope, catalog, ref)
    return table
      ? [
          {
            qualifier: ref.alias ?? table.name,
            qualify: local.length > 1 || !local.includes(ref),
            table,
          },
        ]
      : []
  })
  const seen = new Set<string>()
  return known.flatMap(({ qualifier, qualify, table }) =>
    columnItems(catalog, table, {
      detail: qualify ? '' : `${qualifier} · `,
      qualifier: qualify ? qualifier : '',
    }).filter((item) => {
      if (seen.has(item.label.toLowerCase())) {
        return false
      }
      seen.add(item.label.toLowerCase())
      return true
    })
  )
}
