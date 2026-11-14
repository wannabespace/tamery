import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { connectionParts } from '@tamery/connection/connection-parts'
import { databaseFile } from '@tamery/connection/database-file'
import { getHostHint } from '@tamery/connection/hosts'
import { readConnectionString } from '@tamery/connection/parse-connection-string'
import { describeConnectionString } from '@tamery/connection/utils'
import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { Result } from 'better-result'

/** Besides every dot folder: where browsers, mail and other apps keep cookies, sessions and keys. */
const APP_DATA_FOLDERS = new Set(['appdata', 'library', 'snap'])
const UNVERIFIED_TLS_PARAMS = [
  'tlsallowinvalidcertificates',
  'tlsallowinvalidhostnames',
  'tlsinsecure',
]
// macOS and Windows match a path in any case, so `/USERS/me/LIBRARY` must not pass for a folder outside the home folder.
const isCaseless = process.platform !== 'linux'

const isInAppData = (file: string) => {
  const absolute = file.startsWith('~/')
    ? path.join(os.homedir(), file.slice(2))
    : path.resolve(file)
  const real = Result.try(() => fs.realpathSync.native(absolute)).unwrapOr(
    absolute
  )
  const relative = path.relative(
    isCaseless ? os.homedir().toLowerCase() : os.homedir(),
    isCaseless ? real.toLowerCase() : real
  )
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false
  }
  const [folder = ''] = relative.split(path.sep)
  return folder.startsWith('.') || APP_DATA_FOLDERS.has(folder.toLowerCase())
}

/** `mongodb+srv://` turns TLS on unless the string turns it off; `mongodb://` leaves it off unless the string turns it on. */
const reachesAtlasOverVerifiedTls = (connectionString: string) => {
  const { host, scheme, searchParams } = readConnectionString(connectionString)
  const tls = [...searchParams.getAll('tls'), ...searchParams.getAll('ssl')]
  return (
    getHostHint(host)?.provider === Provider.MongoDBAtlas &&
    (tls.length > 0
      ? tls.every((value) => value === 'true')
      : scheme === 'mongodb+srv') &&
    UNVERIFIED_TLS_PARAMS.every((param) =>
      searchParams.getAll(param).every((value) => value === 'false')
    )
  )
}

/**
 * What a paired browser may not have the bridge open, even in a connection it saved: pairing trusts the browser, and code
 * running in it (a compromised web app, a browser extension) must not read other apps' files or hand this computer's cloud
 * login to a server that could replay it.
 */
export const confinement = {
  getRefusal: (connectionString: string) => {
    const { host, type } = connectionParts.parse(connectionString)
    if (
      (type === ConnectionType.SQLite || type === ConnectionType.DuckDB) &&
      !host &&
      isInAppData(databaseFile.path(connectionString))
    ) {
      return 'The bridge does not open files in app data folders, such as ~/Library, AppData or a folder starting with a dot, where browsers and other apps keep cookies and keys. Move the database elsewhere, or open it in the desktop app.'
    }
    if (
      describeConnectionString(connectionString).usesMachineCredentials &&
      !reachesAtlasOverVerifiedTls(connectionString)
    ) {
      return "The bridge signs in with this computer's AWS, OIDC or Kerberos credentials only to MongoDB Atlas over TLS that checks its certificate. Open this connection in the desktop app."
    }
    return null
  },
}
