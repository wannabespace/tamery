import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { pickFile } from './pick-file'

const DATABASE_FILES = {
  [ConnectionType.DuckDB]: {
    extensions: ['duckdb', 'ddb', 'db'],
    name: 'DuckDB databases',
  },
  [ConnectionType.SQLite]: {
    extensions: ['db', 'db3', 'sqlite', 'sqlite3'],
    name: 'SQLite databases',
  },
}

export const pickDatabaseFile = (
  type: ConnectionType.DuckDB | ConnectionType.SQLite
) =>
  pickFile({
    buttonLabel: 'Open',
    filters: [DATABASE_FILES[type], { extensions: ['*'], name: 'All files' }],
    properties: ['openFile'],
  })
