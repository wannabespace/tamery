import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { connectionParts } from '@tamery/connection/connection-parts'
import { databaseFile } from '@tamery/connection/database-file'
import { getHostHint } from '@tamery/connection/hosts'
import { readConnectionString } from '@tamery/connection/parse-connection-string'
import { describeConnectionString, FILE_PARAMS } from '@tamery/connection/utils'
import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { Result } from 'better-result'

/** Besides every dot folder: where browsers, mail and other apps keep cookies, sessions and keys. */
const APP_DATA_FOLDERS = new Set(['appdata', 'library', 'snap'])
const UNVERIFIED_TLS_PARAMS = [
  'tlsallowinvalidcertificates',
  'tlsallowinvalidhostnames',
  'tlsinsecure',
]

const getAbsolutePath = (file: string) =>
  file.startsWith('~/')
    ? path.join(os.homedir(), file.slice(2))
    : path.resolve(file)

const getRealPath = (file: string): string => {
  const real = Result.try(() => fs.realpathSync.native(file))
  const parent = path.dirname(file)
  return real.isOk() || parent === file
    ? real.unwrapOr(file)
    : path.join(getRealPath(parent), path.basename(file))
}

const getFolderId = (folder: string) => {
  const stats = fs.statSync(folder, { bigint: true, throwIfNoEntry: false })
  return stats ? `${stats.dev}:${stats.ino}` : null
}

/** Finds the home folder by its identity, not its spelling: a symlinked home, macOS's `/System/Volumes/Data` and another case all name it. */
const isInAppData = (file: string) => {
  const home = getFolderId(os.homedir())
  let child = getRealPath(file)
  for (let parent = path.dirname(child); parent !== child;) {
    if (getFolderId(parent) === home) {
      const folder = path.basename(child).toLowerCase()
      return folder.startsWith('.') || APP_DATA_FOLDERS.has(folder)
    }
    child = parent
    parent = path.dirname(parent)
  }
  return false
}

// A driver reads these with a blocking `readFileSync`, which a device or pipe (`/dev/zero`) never lets return.
const isSpecialFile = (file: string) => {
  const stats = fs.statSync(file, { throwIfNoEntry: false })
  return !!stats && !stats.isFile()
}

/**
 * Every seed must be Atlas, since the driver signs in to each. `mongodb+srv://` turns TLS on unless the string turns it off;
 * `mongodb://` leaves it off unless the string turns it on. A `tlsCAFile` replaces the system's authorities.
 */
const reachesAtlasOverVerifiedTls = (connectionString: string) => {
  const { host, scheme, searchParams } = readConnectionString(connectionString)
  const tls = [...searchParams.getAll('tls'), ...searchParams.getAll('ssl')]
  return (
    host
      .split(',')
      .every((seed) => getHostHint(seed)?.provider === Provider.MongoDBAtlas) &&
    (tls.length > 0
      ? tls.every((value) => value === 'true')
      : scheme === 'mongodb+srv') &&
    UNVERIFIED_TLS_PARAMS.every((param) =>
      searchParams.getAll(param).every((value) => value === 'false')
    ) &&
    !searchParams.has('tlscafile')
  )
}

/**
 * What a paired browser may not have the bridge open, even in a connection it saved: pairing trusts the browser, and code
 * running in it (a compromised web app, a browser extension) must not read other apps' files, hang the bridge on a device
 * or hand this computer's cloud login to a server that could replay it.
 */
export const confinement = {
  getRefusal: (connectionString: string) => {
    const { host, ssh, type } = connectionParts.parse(connectionString)
    const { searchParams } = readConnectionString(connectionString)
    const database =
      (type === ConnectionType.SQLite || type === ConnectionType.DuckDB) &&
      !host
        ? getAbsolutePath(databaseFile.path(connectionString))
        : null
    if (database && isInAppData(database)) {
      return 'The bridge does not open files in app data folders, such as ~/Library, AppData or a folder starting with a dot, where browsers and other apps keep cookies and keys. Move the database elsewhere, or open it in the desktop app.'
    }
    const files = [
      database,
      ...FILE_PARAMS.flatMap((param) => searchParams.getAll(param)),
      ssh?.auth === 'keyPath' ? ssh.keyPath : null,
    ]
    if (files.some((file) => file && isSpecialFile(getAbsolutePath(file)))) {
      return 'The bridge opens only regular files, never a device, pipe or folder. Check the paths in this connection.'
    }
    if (
      describeConnectionString(connectionString).usesMachineCredentials &&
      !reachesAtlasOverVerifiedTls(connectionString)
    ) {
      return "The bridge signs in with this computer's AWS, OIDC or Kerberos credentials only to MongoDB Atlas, over TLS that checks its certificate against the system's authorities. Open this connection in the desktop app."
    }
    return null
  },
}
