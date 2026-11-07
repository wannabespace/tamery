import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { SafeURL } from '@tamery/shared/safe-url'

import {
  connectionParts,
  MOTHERDUCK_DEFAULT_DATABASE,
} from './connection-parts'
import { isInternalHost } from './hosts'
import { readConnectionString } from './parse-connection-string'
import { connectionSecrets } from './secrets'
import { SSH_PARAMS } from './ssh/params'

export const SQLITE_RESOURCE_NAME = 'main'

interface EngineString {
  /** The login is checked against the path's database unless `authSource` says otherwise, so a resource switch keeps it there. */
  authenticatesInPath?: boolean
  /** The database the server opens when the string names none; absent when only the server knows (a login's default). */
  defaultDatabase?: (user: string) => string
  /** The schema unqualified names resolve in, where the engine takes it from the login rather than the database. */
  defaultSchema?: (user: string) => string
  /** Only the desktop app ships the driver: the bridge refuses it and the cloud proxy opens no file. */
  desktopOnly?: true
  label: (parts: { address: string; database: string; host: string }) => string
  /** The one resource the engine opens, kept out of the string's path; `null` when the path names it. */
  resource: ((database: string) => string) | null
}

const SERVER_STRING: EngineString = {
  label: ({ address }) => address,
  resource: null,
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const sqliteResource = () => SQLITE_RESOURCE_NAME

/** DuckDB names a file's database after the file, cut at its first dot. */
const duckdbResource = (path: string) => fileName(path).replace(/\..*$/u, '')

const MONGODB_STRING: EngineString = {
  ...SERVER_STRING,
  authenticatesInPath: true,
  defaultDatabase: () => 'test',
}

const ENGINE_STRINGS: Record<ConnectionType | Provider, EngineString> = {
  [ConnectionType.ClickHouse]: {
    ...SERVER_STRING,
    defaultDatabase: () => 'default',
  },
  [ConnectionType.DuckDB]: {
    desktopOnly: true,
    label: ({ database }) => fileName(database),
    resource: duckdbResource,
  },
  [ConnectionType.MariaDB]: SERVER_STRING,
  [ConnectionType.MongoDB]: MONGODB_STRING,
  [ConnectionType.MSSQL]: SERVER_STRING,
  [ConnectionType.MySQL]: SERVER_STRING,
  [ConnectionType.Oracle]: {
    ...SERVER_STRING,
    defaultSchema: (user) => user.toUpperCase(),
  },
  [ConnectionType.Postgres]: {
    ...SERVER_STRING,
    defaultDatabase: (user) => user,
  },
  [ConnectionType.SQLite]: {
    label: ({ database }) => fileName(database),
    resource: sqliteResource,
  },
  [Provider.CloudflareD1]: {
    label: ({ database }) => database,
    resource: sqliteResource,
  },
  [Provider.MongoDBAtlas]: MONGODB_STRING,
  [Provider.MotherDuck]: {
    ...SERVER_STRING,
    defaultDatabase: () => MOTHERDUCK_DEFAULT_DATABASE,
  },
  [Provider.Turso]: {
    label: ({ host }) => host,
    resource: sqliteResource,
  },
}

const getEngineString = (connectionString: string) => {
  const { provider, type } = connectionParts.parse(connectionString)
  return type ? ENGINE_STRINGS[provider ?? type] : SERVER_STRING
}

/** The drivers read each of these as a path on the disk of whatever runs them. */
export const FILE_PARAMS = [
  'sslca',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'tlscafile',
  'tlscertificatekeyfile',
  'tlscrlfile',
]

/** The MongoDB driver takes these logins' credentials from the machine running it: its environment, `~/.aws`, a cloud metadata service or a Kerberos ticket. */
const MACHINE_CREDENTIAL_MECHANISMS = new Set([
  'GSSAPI',
  'MONGODB-AWS',
  'MONGODB-OIDC',
])

export const describeConnectionString = (connectionString: string) => {
  const { database, host, password, searchParams, user } =
    readConnectionString(connectionString)
  const authMechanism = searchParams.get('authmechanism')
  const { defaultDatabase, defaultSchema, desktopOnly, label, resource } =
    getEngineString(connectionString)
  return {
    defaultResourceName:
      resource?.(database) ?? (database || defaultDatabase?.(user) || null),
    defaultSchema: defaultSchema?.(user) || null,
    desktopOnly: !!desktopOnly,
    displayUrl: label({
      address: new SafeURL(connectionString).host,
      database,
      host,
    }),
    isInternal: isInternalHost(host),
    isPasswordPopulated: !!password,
    missingSecrets: connectionSecrets.missing(searchParams),
    usesMachineCredentials:
      !!authMechanism &&
      MACHINE_CREDENTIAL_MECHANISMS.has(authMechanism.toUpperCase()),
    usesSsh: !!searchParams.get(SSH_PARAMS.host),
  }
}

const AUTH_SOURCE = 'authsource'
const MONGODB_AUTH_DATABASE = 'admin'

export const resourceConnectionString = (
  connectionString: string,
  resourceName: string | null
) => {
  const { authenticatesInPath, resource } = getEngineString(connectionString)
  if (resource) {
    return connectionString
  }
  const url = new SafeURL(connectionString)
  const { database, searchParams, user } =
    readConnectionString(connectionString)
  if (authenticatesInPath && user && !searchParams.has(AUTH_SOURCE)) {
    url.searchParams.set('authSource', database || MONGODB_AUTH_DATABASE)
  }
  url.pathname = encodeURIComponent(resourceName ?? '')
  return url.toString()
}
