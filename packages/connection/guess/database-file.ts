import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { decodeURIComponentOrRaw } from '@tamery/shared/utils'

import type { DatabaseGuess } from './types'

const QUOTED = /^(?<quote>["'])(?<inner>.*)\k<quote>$/su
const URI_PARAMS = /\?.*$/su
const LEADING_SLASHES = /^\/{2,}/u
const ABSOLUTE_PATH = /^(?:\/|~\/|[a-z]:[\\/])[^\n]*$/iu

const FILE_ENGINES = [
  {
    cli: /^duckdb\s+/iu,
    extension: /\.(?:duckdb|ddb)$/iu,
    type: ConnectionType.DuckDB,
    url: /^(?:jdbc:)?duckdb:(?:\/\/)?/iu,
  },
  {
    cli: /^sqlite3?\s+/iu,
    extension: /\.(?:db|db3|sqlite|sqlite3)$/iu,
    type: ConnectionType.SQLite,
    url: /^(?:jdbc:sqlite:(?:file:)?|(?:sqlite3?|file):)(?:\/\/)?/iu,
  },
]

const unquote = (text: string) => text.replace(QUOTED, '$<inner>')

/** A bare path counts only with the engine's extension; its CLI (`sqlite3 <file>`, `duckdb <file>`) and URL schemes name one outright. */
export const guessDatabaseFile = (text: string): DatabaseGuess | null => {
  const trimmed = unquote(text.trim())
  for (const engine of FILE_ENGINES) {
    const url = engine.url.exec(trimmed)?.[0]
    const cli = engine.cli.exec(trimmed)?.[0]
    const rest = unquote(trimmed.slice((url ?? cli ?? '').length))
    const path = (
      url ? decodeURIComponentOrRaw(rest.replace(URI_PARAMS, '')) : rest
    ).replace(LEADING_SLASHES, '/')
    if (
      ABSOLUTE_PATH.test(path) &&
      (url || cli || engine.extension.test(path))
    ) {
      return {
        format: url ? 'url' : 'path',
        parts: { database: path, type: engine.type },
      }
    }
  }
  return null
}
