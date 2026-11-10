import type { SqlCatalog, SqlColumn, SqlTable } from './catalog'
import { findColumn, findTable } from './catalog'
import type { ColumnRef } from './cursor'
import { columnRefAt, selectList } from './cursor'
import type { Relation } from './relation'
import type { StatementScope, TableRef } from './scope'
import { statementScope } from './scope'
import type { Token } from './tokenizer'
import { identifierName, isKeyword, isPunctuation } from './tokenizer'

type NameScope = Pick<StatementScope, 'relations' | 'visible'>

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const refFor = (scope: NameScope, qualifier: string) =>
  scope.visible.findLast(
    (ref) =>
      (ref.alias !== null && sameName(ref.alias, qualifier)) ||
      sameName(ref.name, qualifier)
  )

/** A select item's column; an unaliased expression has no name until a column list gives it one. */
type ItemColumn = Omit<SqlColumn, 'name'> & { name: string | null }

/** Passed down rather than imported, since a relation's columns resolve through the tables it reads, relations included. */
type TableLookup = (scope: NameScope, ref: TableRef) => SqlTable | undefined

const columnIn = (
  scope: NameScope,
  catalog: SqlCatalog,
  lookup: TableLookup,
  columnRef: ColumnRef | null
): { column: SqlColumn; table: SqlTable } | null => {
  if (!columnRef) {
    return null
  }
  const refs = columnRef.qualifier
    ? [refFor(scope, columnRef.qualifier)]
    : scope.visible.toReversed()
  for (const ref of refs) {
    const table = ref && lookup(scope, ref)
    const column = table && findColumn(catalog, table, columnRef.name)
    if (table && column) {
      return { column, table }
    }
  }
  return null
}

const columnOf = (
  scope: NameScope,
  catalog: SqlCatalog,
  lookup: TableLookup,
  name: string | null,
  expression: Token[]
): ItemColumn => {
  const isColumnRef =
    expression.length === 1 ||
    (expression.length === 3 && isPunctuation(expression[1], '.'))
  const resolved = isColumnRef
    ? columnIn(
        scope,
        catalog,
        lookup,
        columnRefAt(expression, expression.length - 1)
      )
    : null
  return {
    name,
    nullable: resolved?.column.nullable ?? true,
    type: resolved?.column.type ?? '',
  }
}

const relationColumns = (
  relation: Relation,
  outer: Relation[],
  catalog: SqlCatalog,
  lookup: TableLookup
): SqlColumn[] => {
  const { at, segments } = selectList(relation.body)
  const inner = statementScope(relation.body, at?.end)
  const scope = {
    relations: [...outer, ...inner.relations],
    visible: inner.visible,
  }
  const columns = segments.flatMap((segment): ItemColumn[] => {
    const last = segment.at(-1)
    if (last?.text === '*') {
      const refs =
        segment.length === 3 && segment[0]
          ? [refFor(scope, identifierName(segment[0]))]
          : scope.visible
      return refs.flatMap((ref) => (ref && lookup(scope, ref)?.columns) ?? [])
    }
    if (last?.kind !== 'identifier') {
      return [columnOf(scope, catalog, lookup, null, segment)]
    }
    const name = identifierName(last)
    const beforeLast = segment.at(-2)
    if (isKeyword(beforeLast, 'AS')) {
      return [columnOf(scope, catalog, lookup, name, segment.slice(0, -2))]
    }
    if (beforeLast && !isPunctuation(beforeLast, '.')) {
      return [columnOf(scope, catalog, lookup, name, segment.slice(0, -1))]
    }
    return [columnOf(scope, catalog, lookup, name, segment)]
  })
  return columns.flatMap((column, index) => {
    const name = relation.columnNames[index] ?? column.name
    return name === null ? [] : [{ ...column, name }]
  })
}

/** A CTE or derived table shadows the catalog's table of the same name, as it does in the query. */
export const scopeTable = (
  scope: NameScope,
  catalog: SqlCatalog,
  ref: TableRef
): SqlTable | undefined => {
  const index =
    ref.schema === null
      ? scope.relations.findLastIndex((relation) =>
          sameName(relation.name, ref.name)
        )
      : -1
  const relation = scope.relations[index]
  if (!relation) {
    return findTable(catalog, ref.name, ref.schema)
  }
  return {
    columns: relationColumns(
      relation,
      scope.relations.slice(0, index),
      catalog,
      (inner, innerRef) => scopeTable(inner, catalog, innerRef)
    ),
    kind: 'subquery',
    name: relation.name,
  }
}

export const tableForQualifier = (
  scope: NameScope,
  catalog: SqlCatalog,
  qualifier: string
) => {
  const ref = refFor(scope, qualifier)
  return ref ? scopeTable(scope, catalog, ref) : undefined
}

export const resolveColumn = (
  columnRef: ColumnRef | null,
  scope: NameScope,
  catalog: SqlCatalog
) =>
  columnIn(
    scope,
    catalog,
    (inner, ref) => scopeTable(inner, catalog, ref),
    columnRef
  )
