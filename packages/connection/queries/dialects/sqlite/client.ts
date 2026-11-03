import { homedir } from 'node:os'
import path from 'node:path'
import { constants, DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { sqliteFile } from '../../../sqlite-file'

// The driver waits for a lock synchronously, holding every other query in the desktop database process, so the wait stays short.
const BUSY_TIMEOUT_MS = 2000

let isConfined = false

/**
 * The bridge opens only files its terminal approved: `ATTACH` and `VACUUM INTO` would reach any other. A plain `VACUUM`
 * attaches an unnamed temporary database, which names no file, so it still runs.
 */
export const confineSqliteFiles = () => {
  isConfined = true
}

/** `mode=rw` fails on a missing file instead of creating an empty database at a mistyped path. */
export const openDatabase = (connectionString: string) => {
  const file = sqliteFile.path(connectionString)
  const url = pathToFileURL(
    file.startsWith('~/') ? path.join(homedir(), file.slice(2)) : file
  )
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
