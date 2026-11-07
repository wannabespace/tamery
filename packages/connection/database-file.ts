import type { ConnectionType } from '@tamery/shared/enums/connection-type'

import { readConnectionString } from './parse-connection-string'

const WINDOWS_DRIVE = /^[a-z]:\//iu

/** Only the desktop app ships DuckDB's driver: the bridge refuses a DuckDB file and the cloud proxy opens no file. */
export const DUCKDB_FILES_ON_DESKTOP =
  'DuckDB files open only in the Tamery desktop app.'

/**
 * A SQLite or DuckDB file's string is its scheme and the file's absolute path, never a host. The cloud proxy refuses an
 * empty host, and the executor refuses any other, which together keep a server from ever opening a file on its own disk.
 */
export const databaseFile = {
  connectionString: (
    type: ConnectionType.DuckDB | ConnectionType.SQLite,
    path: string
  ) => {
    const slashed = path.trim().replaceAll('\\', '/')
    const absolute = slashed.startsWith('/') ? slashed : `/${slashed}`
    return `${type}://${absolute.split('/').map(encodeURIComponent).join('/')}`
  },
  /** A `~/` path stays relative to the home folder of whichever computer opens it. */
  path: (connectionString: string) => {
    const database = readConnectionString(connectionString).database.replace(
      /^\/+/u,
      ''
    )
    return WINDOWS_DRIVE.test(database) || database.startsWith('~/')
      ? database
      : `/${database}`
  },
}
