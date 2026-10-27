import type { Dialect } from '@tamery/shared/enums/connection-type'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { silently } from '@tamery/shared/utils'
import type { SqlCatalog } from '@tamery/sql'
import { dialects, splitStatements, statementScope } from '@tamery/sql'
import type { editor } from 'monaco-editor'
import { Range } from 'monaco-editor'

import { catalogSummary } from './catalog-summary'

export interface TableRef {
  name: string
  schema: string | null
}

export interface QuerySource {
  catalog: () => SqlCatalog
  complete: (
    input: { context: string; prefix: string; suffix: string },
    signal: AbortSignal
  ) => Promise<string>
  ghostTextEnabled: () => boolean
  load: (refs: TableRef[]) => Promise<unknown> | undefined
  onCatalogChange: (listener: () => void) => () => void
  dialect: Dialect
}

export const boundSources = new WeakMap<editor.ITextModel, QuerySource>()

export const EMPTY_CATALOG: SqlCatalog = {
  defaultSchema: null,
  enums: [],
  nameCase: null,
  schemas: [],
}

export const getRange = (
  model: editor.ITextModel,
  start: number,
  end: number
) => Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end))

export const tablesIn = (text: string, dialect: Dialect) =>
  isSqlDialect(dialect)
    ? splitStatements(text, dialects[dialect]).flatMap(
        (statement) => statementScope(statement.tokens).tables
      )
    : []

export const catalogSummaryFor = async (
  model: editor.ITextModel,
  sql: string
) => {
  const source = boundSources.get(model)
  if (!source) {
    return ''
  }
  await silently(() => source.load(tablesIn(sql, source.dialect)))
  return catalogSummary(source.catalog())
}
