import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { connectionParts } from '@tamery/connection/connection-parts'
import { getHostHint, isLocalHost } from '@tamery/connection/hosts'
import { localPath } from '@tamery/connection/local-path'
import { readConnectionString } from '@tamery/connection/parse-connection-string'
import { describeConnectionString, FILE_PARAMS } from '@tamery/connection/utils'
import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

/** Besides every dot folder: where browsers, mail and other apps keep cookies, sessions and keys. */
const APP_DATA_FOLDERS = new Set(['appdata', 'library', 'snap'])
const UNVERIFIED_TLS_PARAMS = [
  'tlsallowinvalidcertificates',
  'tlsallowinvalidhostnames',
  'tlsinsecure',
]

const getFolderId = (folder: string) => {
  const stats = fs.statSync(folder, { bigint: true, throwIfNoEntry: false })
  return stats ? `${stats.dev}:${stats.ino}` : null
}

const isAppDataFolder = (folder: string) => {
  const name = folder.toLowerCase()
  return name.startsWith('.') || APP_DATA_FOLDERS.has(name)
}

/**
 * This computer's home is found by identity, not spelling: a symlinked home, macOS's `/System/Volumes/Data` and another case
 * all name it. Any other `Users/<name>` counts too, as WSL mounts Windows' homes under `/mnt/c/Users`.
 */
const isInAppData = (file: string) => {
  const folders = file.split(path.sep)
  if (
    folders.some(
      (folder, index) =>
        folders[index - 2]?.toLowerCase() === 'users' && isAppDataFolder(folder)
    )
  ) {
    return true
  }
  const home = getFolderId(os.homedir())
  if (!home) {
    return false
  }
  let child = file
  for (let parent = path.dirname(child); parent !== child;) {
    if (getFolderId(parent) === home) {
      return isAppDataFolder(path.basename(child))
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
  /** Another app's saved password serves only a database on this computer, never a server that app reaches (a production one in DBeaver). */
  allowsFoundPassword: (connectionString: string) => {
    const { host, ssh } = connectionParts.parse(connectionString)
    return !ssh && isLocalHost(host)
  },
  getRefusal: (connectionString: string) => {
    const { host, ssh, type } = connectionParts.parse(connectionString)
    const { searchParams } = readConnectionString(connectionString)
    const database =
      (type === ConnectionType.SQLite || type === ConnectionType.DuckDB) &&
      !host
        ? localPath.getDatabaseFile(connectionString)
        : null
    if (database && isInAppData(database)) {
      return 'The bridge does not open files in app data folders, such as ~/Library, AppData or a folder starting with a dot, where browsers and other apps keep cookies and keys. Move the database elsewhere, or open it in the desktop app.'
    }
    const files = [
      database,
      ...FILE_PARAMS.flatMap((param) =>
        searchParams.getAll(param).map((file) => path.resolve(file))
      ),
      ssh?.auth === 'keyPath' && ssh.keyPath
        ? localPath.expand(ssh.keyPath)
        : null,
    ]
    if (files.some((file) => file && isSpecialFile(file))) {
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
