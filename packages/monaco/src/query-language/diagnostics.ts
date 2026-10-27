import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { noop, silently } from '@tamery/shared/utils'
import { diagnose, dialects } from '@tamery/sql'
import { editor, MarkerSeverity } from 'monaco-editor'

import type { QuerySource } from './source'
import { getRange, tablesIn } from './source'

const DIAGNOSTICS_DELAY = 250
const MARKER_OWNER = 'tamery-sql'

export const attachSqlDiagnostics = (
  codeEditor: editor.IStandaloneCodeEditor,
  source: QuerySource
) => {
  if (!isSqlDialect(source.dialect)) {
    return noop
  }
  const dialect = dialects[source.dialect]
  let timer: ReturnType<typeof setTimeout> | undefined

  const run = () => {
    const model = codeEditor.getModel()
    if (!model) {
      return
    }
    const text = model.getValue()
    const catalog = source.catalog()
    silently(() => source.load(tablesIn(text, source.dialect)))
    const markers = diagnose(text, dialect, catalog).map((diagnostic) => ({
      ...getRange(model, diagnostic.start, diagnostic.end),
      message: diagnostic.message,
      severity:
        diagnostic.severity === 'error'
          ? MarkerSeverity.Error
          : MarkerSeverity.Warning,
    }))
    editor.setModelMarkers(model, MARKER_OWNER, markers)
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(run, DIAGNOSTICS_DELAY)
  }

  schedule()
  const contentListener = codeEditor.onDidChangeModelContent(schedule)
  const unsubscribeCatalog = source.onCatalogChange(schedule)

  return () => {
    clearTimeout(timer)
    contentListener.dispose()
    unsubscribeCatalog()
    const model = codeEditor.getModel()
    if (model) {
      editor.setModelMarkers(model, MARKER_OWNER, [])
    }
  }
}
