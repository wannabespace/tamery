import { homedir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { sqliteFile } from '../../../sqlite-file'

// The driver waits for a lock synchronously, holding every other query in the desktop database process, so the wait stays short.
const BUSY_TIMEOUT_MS = 2000

let limits: { attach: number } | undefined

/** The bridge opens only files its terminal approved: `ATTACH` and `VACUUM INTO` would reach any other. */
export const confineSqliteFiles = () => {
  limits = { attach: 0 }
}

/** `mode=rw` fails on a missing file instead of creating an empty database at a mistyped path. */
export const openDatabase = (connectionString: string) => {
  const file = sqliteFile.path(connectionString)
  const url = pathToFileURL(
    file.startsWith('~/') ? path.join(homedir(), file.slice(2)) : file
  )
  url.searchParams.set('mode', 'rw')
  return new DatabaseSync(url, { limits, timeout: BUSY_TIMEOUT_MS })
}
