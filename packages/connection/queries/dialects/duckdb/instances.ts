import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { DuckDBInstance } from '@duckdb/node-api'
import { silently } from '@tamery/shared/utils'

import { databaseFile } from '../../../database-file'
import { duckdbDriver } from './driver'

const FILE_BUSY_TIMEOUT_MS = 10_000

const FILE_BUSY = `Tamery still has this file open in another mode after ${FILE_BUSY_TIMEOUT_MS / 1000} seconds. Finish the transaction open on it, then try again.`

interface OpenFile {
  closed: PromiseWithResolvers<void>
  instance: Promise<DuckDBInstance>
  readOnly: boolean
  users: number
}

/**
 * One instance per file, keyed by its real path: two in one process each keep their own state of the file and never see
 * the other's writes, a symlink's included. It closes once its last user is done, so another tool can open the file
 * between Tamery's calls.
 */
const openFiles = new Map<string, OpenFile>()

const waitForClose = (entry: OpenFile) =>
  Promise.race([
    entry.closed.promise,
    sleep(FILE_BUSY_TIMEOUT_MS, null, { ref: false }).then(() => {
      throw new Error(FILE_BUSY)
    }),
  ])

let isConfined = false

/** The bridge opens only files its terminal approved: a confined instance reads no other file or URL, writes included. */
export const confineDuckdbFiles = () => {
  isConfined = true
}

const open = (file: string, readOnly: boolean) => {
  const entry: OpenFile = {
    closed: Promise.withResolvers(),
    instance: duckdbDriver.load().DuckDBInstance.create(file, {
      ...(readOnly && { access_mode: 'READ_ONLY' }),
      ...((readOnly || isConfined) && { enable_external_access: 'false' }),
    }),
    readOnly,
    users: 0,
  }
  openFiles.set(file, entry)
  return entry
}

/**
 * Resolves only once this call holds a use of the file's instance, and its `release` gives back that use alone. A read-only
 * instance also turns off reading any other file or URL, which DuckDB allows only per instance.
 */
const acquire = async (
  file: string,
  readOnly: boolean
): Promise<{ instance: DuckDBInstance; release: () => Promise<void> }> => {
  const current = openFiles.get(file)
  if (current && current.readOnly !== readOnly) {
    await waitForClose(current)
    return acquire(file, readOnly)
  }
  const entry = current ?? open(file, readOnly)
  entry.users += 1
  const release = async () => {
    entry.users -= 1
    if (entry.users > 0) {
      return
    }
    openFiles.delete(file)
    await silently(async () => {
      const instance = await entry.instance
      instance.closeSync()
    })
    entry.closed.resolve()
  }
  try {
    return { instance: await entry.instance, release }
  } catch (error) {
    await release()
    throw error
  }
}

export const connectTo = async (
  connectionString: string,
  readOnly: boolean
) => {
  const file = databaseFile.path(connectionString)
  // DuckDB would create an empty database at a mistyped path.
  const real = await realpath(
    file.startsWith('~/') ? path.join(homedir(), file.slice(2)) : file
  ).catch((error: unknown) => {
    throw new Error(`There is no file at ${file}.`, { cause: error })
  })
  const { instance, release } = await acquire(real, readOnly)
  try {
    const connection = await instance.connect()
    return {
      connection,
      release: () => {
        connection.closeSync()
        return release()
      },
    }
  } catch (error) {
    await release()
    throw error
  }
}
