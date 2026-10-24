import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import { dialects } from '@tamery/sql'
import type { IDisposable } from 'monaco-editor'

import { registerMongoCompletion } from '../mongo-language/completion'
import { registerMongoTokens } from '../mongo-language/language'
import { registerCompletion } from './completion'
import { registerGhostText } from './ghost-text'
import { languageIds, registerLanguage } from './language'

export { SQL_COMPLETION_OPTIONS } from './completion'
export { attachSqlDiagnostics } from './diagnostics'
export {
  acceptGhostText,
  attachGhostTextEscape,
  bindSqlModel,
  dismissGhostText,
  drawnGhostTextElement,
} from './ghost-text'
export { languageIds } from './language'
export type { SqlSource, TableRef } from './source'
export { catalogSummaryFor, EMPTY_CATALOG } from './source'

const registerSqlLanguage = (dialect: SqlDialect) => {
  const id = languageIds[dialect]
  const spec = dialects[dialect]
  return [
    ...registerLanguage(id, spec),
    registerCompletion(id, spec),
    registerGhostText(id, spec),
  ]
}

declare global {
  // Monaco is page-wide: a hot reload must dispose the earlier evaluation's providers, or every suggestion repeats.
  var tamerySqlLanguage: IDisposable[] | undefined
}

for (const disposable of globalThis.tamerySqlLanguage ?? []) {
  disposable.dispose()
}
globalThis.tamerySqlLanguage = [
  ...Object.values(Dialect).filter(isSqlDialect).flatMap(registerSqlLanguage),
  ...registerMongoTokens(languageIds.mongodb),
  registerMongoCompletion(languageIds.mongodb),
]
