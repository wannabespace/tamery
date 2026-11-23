import fs from 'node:fs'
import os from 'node:os'

import { Result } from 'better-result'

import { databaseFile } from './database-file'

/** Paths on the computer that runs the driver: node only, unlike `databaseFile`. */
export const localPath = {
  expand: (file: string) => file.replace(/^~(?=$|\/)/u, os.homedir()),
  /**
   * The file a SQLite or DuckDB string opens, every symlink and `..` resolved on disk, or `null` when there is none. The
   * machine's confinement checks this very path, so both drivers open it and nothing else: resolving `..` by text instead
   * would open another file than the one checked.
   */
  getDatabaseFile: (connectionString: string) =>
    Result.try(() =>
      fs.realpathSync.native(
        localPath.expand(databaseFile.path(connectionString))
      )
    ).unwrapOr(null),
}
