import type { SqlCatalog } from './catalog'
import { findEnum, findSchema, findTable } from './catalog'
import type { CompletionContext } from './completion-context'
import type { CompletionItem } from './completion-items'
import {
  columnItems,
  functionItems,
  keywordItems,
  orderedItems,
  scopeColumnItems,
  quoteIfNeeded,
  tableItems,
} from './completion-items'
import { templateItems } from './completion-templates'
import type { DialectSpec } from './dialect'
import { resolveColumn, scopeTable, tableForQualifier } from './resolve'

const OPERATORS = [
  '=',
  '<>',
  '>',
  '<',
  '>=',
  '<=',
  'IN (',
  'NOT IN (',
  'LIKE',
  'ILIKE',
  'IS NULL',
  'IS NOT NULL',
  'BETWEEN',
]
const LIMITS = ['10', '50', '100', '1000']
const STATEMENT_VERBS = [
  'SELECT',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'WITH',
  'EXPLAIN',
  'SHOW',
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
]
const BOOLEAN_TYPE = /bool|^bit$/iu
const TEXT_TYPE = /char|text|string|citext|uuid/iu

const qualifiedItems = (
  context: CompletionContext,
  catalog: SqlCatalog
): CompletionItem[] => {
  const [first, second] = context.qualifier
  if (first === undefined) {
    return []
  }
  if (second !== undefined) {
    const table = findTable(catalog, second, first)
    return table ? columnItems(catalog, table) : []
  }
  const { scope } = context
  const table =
    tableForQualifier(scope, catalog, first) ??
    findTable(catalog, first, null) ??
    (first.toLowerCase() === 'excluded' && scope.target
      ? scopeTable(scope, catalog, scope.target)
      : undefined)
  if (table) {
    return columnItems(catalog, table)
  }
  const schema = findSchema(catalog, first)
  return (
    schema?.tables.map((item) => ({
      detail: item.kind,
      insertText: quoteIfNeeded(catalog, item.name),
      kind: item.kind === 'view' ? 'view' : 'table',
      label: item.name,
      sortText: `2${item.name}`,
    })) ?? []
  )
}

const operatorItems = (
  resolved: ReturnType<typeof resolveColumn>
): CompletionItem[] => {
  const type = resolved?.column.type ?? ''
  const first = [
    ...(BOOLEAN_TYPE.test(type) ? ['= TRUE', '= FALSE'] : []),
    ...(TEXT_TYPE.test(type) ? ['=', 'LIKE', 'ILIKE'] : []),
    ...(resolved?.column.nullable ? ['IS NULL', 'IS NOT NULL'] : []),
  ]
  return orderedItems(
    [...new Set([...first, ...OPERATORS])].map((label) => ({ label })),
    'operator'
  )
}

const valueItems = (
  resolved: ReturnType<typeof resolveColumn>,
  catalog: SqlCatalog
): CompletionItem[] => {
  if (!resolved) {
    return []
  }
  const { column, table } = resolved
  const enumeration = findEnum(catalog, table.name, column)
  if (enumeration) {
    return orderedItems(
      enumeration.values.map((value) => ({
        detail: `enum ${enumeration.name}`,
        insertText: `'${value.replaceAll("'", "''")}'`,
        label: value,
      })),
      'enum'
    )
  }
  if (BOOLEAN_TYPE.test(column.type)) {
    return orderedItems([{ label: 'TRUE' }, { label: 'FALSE' }], 'value')
  }
  return []
}

const cased = (item: CompletionItem, keywordCase: 'upper' | 'lower') =>
  keywordCase === 'lower' &&
  (item.kind === 'keyword' ||
    item.kind === 'operator' ||
    item.kind === 'function' ||
    item.kind === 'value')
    ? { ...item, insertText: item.insertText.toLowerCase() }
    : item

export const completionItems = (
  context: CompletionContext,
  catalog: SqlCatalog,
  dialect: DialectSpec
): CompletionItem[] => {
  const resolved = resolveColumn(context.comparedColumn, context.scope, catalog)
  if (context.inLiteral) {
    return valueItems(resolved, catalog)
      .filter((item) => item.kind === 'enum')
      .map((item) => ({
        ...item,
        insertText: item.label.replaceAll("'", "''"),
      }))
  }
  if (context.qualifier.length > 0) {
    return qualifiedItems(context, catalog)
  }

  const items: CompletionItem[] = []

  switch (context.expects) {
    case 'clause': {
      items.push(
        ...templateItems(context, catalog),
        ...orderedItems(
          context.clauses.map((label) => ({ label })),
          'keyword',
          '1'
        )
      )
      break
    }
    case 'operator': {
      items.push(...operatorItems(resolved))
      break
    }
    case 'statement': {
      items.push(
        ...orderedItems(
          STATEMENT_VERBS.filter((verb) =>
            dialect.keywords.has(verb.split(' ')[0] ?? '')
          ).map((label) => ({ label })),
          'keyword'
        )
      )
      break
    }
    case 'number': {
      items.push(
        ...orderedItems(
          LIMITS.map((label) => ({ label })),
          'value'
        )
      )
      break
    }
    case 'table': {
      items.push(
        ...context.scope.ctes.map((name) => ({
          detail: 'CTE',
          insertText: name,
          kind: 'table' as const,
          label: name,
          sortText: `0${name}`,
        })),
        ...tableItems(catalog),
        ...catalog.schemas.map((schema) => ({
          detail: 'schema',
          insertText: quoteIfNeeded(catalog, schema.name),
          kind: 'schema' as const,
          label: schema.name,
          sortText: `3${schema.name}`,
        }))
      )
      break
    }
    case 'target-column': {
      const table =
        context.scope.target &&
        scopeTable(context.scope, catalog, context.scope.target)
      items.push(...(table ? columnItems(catalog, table) : []))
      break
    }
    case 'column': {
      items.push(
        ...valueItems(resolved, catalog),
        ...templateItems(context, catalog),
        ...scopeColumnItems(context.scope, catalog),
        ...functionItems(dialect),
        ...keywordItems(dialect)
      )
      break
    }
    default: {
      items.push(
        ...tableItems(catalog),
        ...functionItems(dialect),
        ...keywordItems(dialect)
      )
    }
  }

  return items.map((item) => cased(item, context.keywordCase))
}
