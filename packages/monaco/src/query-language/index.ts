import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import { dialects } from '@tamery/sql'
import type { IDisposable } from 'monaco-editor'

import {
  MONGO_DOCUMENT_LANGUAGE,
  registerMongoCompletion,
  registerMongoDocumentCompletion,
} from '../mongo-language/completion'
import { mongoGhostLanguage } from '../mongo-language/ghost-text'
import { registerMongoTokens } from '../mongo-language/language'
import { registerCompletion } from './completion'
import { registerGhostText } from './ghost-text'
import { sqlGhostLanguage } from './ghost-text-language'
import { languageIds, registerLanguage } from './language'

export { QUERY_COMPLETION_OPTIONS } from './completion'
export { attachSqlDiagnostics } from './diagnostics'
export {
  acceptGhostText,
  attachGhostTextEscape,
  bindQueryModel,
  dismissGhostText,
  drawnGhostTextElement,
} from './ghost-text'
export { languageIds } from './language'
export { MONGO_DOCUMENT_LANGUAGE } from '../mongo-language/completion'
export type { QuerySource, TableRef } from './source'
export { catalogSummaryFor, EMPTY_CATALOG } from './source'

const registerSqlLanguage = (dialect: SqlDialect) => {
  const id = languageIds[dialect]
  const spec = dialects[dialect]
  return [
    ...registerLanguage(id, spec),
    registerCompletion(id, spec),
    registerGhostText(id, sqlGhostLanguage(spec)),
  ]
}

const mongoGhost = mongoGhostLanguage()

const disposables: IDisposable[] = [
  ...Object.values(Dialect).filter(isSqlDialect).flatMap(registerSqlLanguage),
  ...registerMongoTokens(languageIds.mongodb),
  registerMongoCompletion(languageIds.mongodb),
  registerGhostText(languageIds.mongodb, mongoGhost),
  ...registerMongoTokens(MONGO_DOCUMENT_LANGUAGE),
  registerMongoDocumentCompletion(MONGO_DOCUMENT_LANGUAGE),
  registerGhostText(MONGO_DOCUMENT_LANGUAGE, mongoGhost),
]

// Monaco is page-wide: without this a hot reload re-registers every provider and each suggestion repeats.
import.meta.hot?.dispose(() => {
  for (const disposable of disposables) {
    disposable.dispose()
  }
})
