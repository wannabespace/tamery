import { constants, DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { localPath } from '../../../local-path'

// SQLite's own message for a missing file, which `diagnose-sqlite` explains.
const MISSING_FILE = 'unable to open database file'

// The driver waits for a lock synchronously, holding every other query in the desktop database process, so the wait stays short.
const BUSY_TIMEOUT_MS = 2000

let isConfined = false

/**
 * The bridge opens only the file its connection names: `ATTACH` and `VACUUM INTO` would reach any other. A plain `VACUUM`
 * attaches an unnamed temporary database, which names no file, so it still runs.
 */
export const confineSqliteFiles = () => {
  isConfined = true
}

/** `mode=rw` fails on a missing file instead of creating an empty database at a mistyped path. */
export const openDatabase = (connectionString: string) => {
  const file = localPath.getDatabaseFile(connectionString)
  if (!file) {
    throw new Error(MISSING_FILE)
  }
  const url = pathToFileURL(file)
  url.searchParams.set('mode', 'rw')
  const database = new DatabaseSync(url, { timeout: BUSY_TIMEOUT_MS })
  if (isConfined) {
    database.setAuthorizer((action, attached) =>
      action === constants.SQLITE_ATTACH && attached !== ''
        ? constants.SQLITE_DENY
        : constants.SQLITE_OK
    )
  }
  return database
}
