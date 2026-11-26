import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { SafeURL } from '@tamery/shared/safe-url'
import { Result } from 'better-result'

import {
  connectionParts,
  MOTHERDUCK_DEFAULT_DATABASE,
} from './connection-parts'
import { isInternalHost } from './hosts'
import { readConnectionString } from './parse-connection-string'
import { connectionSecrets } from './secrets'
import { SSH_PARAMS } from './ssh/params'

export const SQLITE_RESOURCE_NAME = 'main'

const RESOURCE_IN_PATH = null
const LOGIN_DEFAULT_DATABASE = null

type EngineString = {
  /** The login is checked against the path's database unless `authSource` says otherwise, so a resource switch keeps it there. */
  authenticatesInPath?: boolean
  /** The schema unqualified names resolve in, where the engine takes it from the login rather than the database. */
  defaultSchema?: (user: string) => string
  label: (parts: { address: string; database: string; host: string }) => string
} & (
  | {
      /** The database the server opens when the string names none. */
      defaultDatabase:
        | ((user: string) => string)
        | typeof LOGIN_DEFAULT_DATABASE
      resource: typeof RESOURCE_IN_PATH
    }
  | {
      /** The one resource the engine opens, kept out of the string's path. */
      resource: (database: string) => string
    }
)

const SERVER_STRING = {
  defaultDatabase: LOGIN_DEFAULT_DATABASE,
  label: ({ address }) => address,
  resource: RESOURCE_IN_PATH,
} satisfies EngineString

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

const getEngineString = (connectionString: string): EngineString => {
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

// Sync with the driver's `AuthMechanism`, in its order: it takes the first one `authMechanism` matches as a `\b…\b` pattern, so `AWS` or `A.S` is MONGODB-AWS.
const MONGODB_AUTH_MECHANISMS = [
  'MONGODB-AWS',
  'DEFAULT',
  'GSSAPI',
  'PLAIN',
  'SCRAM-SHA-1',
  'SCRAM-SHA-256',
  'MONGODB-X509',
  'MONGODB-OIDC',
]

const isMachineCredentialLogin = (authMechanism: string) =>
  Result.try(() => {
    // oxlint-disable-next-line eslint/require-unicode-regexp -- the driver's own flags: `u` refuses patterns it accepts
    const pattern = new RegExp(String.raw`\b${authMechanism}\b`, 'i')
    const mechanism = MONGODB_AUTH_MECHANISMS.find((name) => pattern.test(name))
    return !!mechanism && MACHINE_CREDENTIAL_MECHANISMS.has(mechanism)
  }).unwrapOr(false)

export const describeConnectionString = (connectionString: string) => {
  const { database, host, password, searchParams, user } =
    readConnectionString(connectionString)
  const engine = getEngineString(connectionString)
  return {
    defaultResourceName:
      engine.resource === RESOURCE_IN_PATH
        ? database || engine.defaultDatabase?.(user) || null
        : engine.resource(database),
    defaultSchema: engine.defaultSchema?.(user) || null,
    displayUrl: engine.label({
      address: new SafeURL(connectionString).host,
      database,
      host,
    }),
    isInternal: isInternalHost(host),
    isPasswordPopulated: !!password,
    missingSecrets: connectionSecrets.missing(searchParams),
    usesMachineCredentials: searchParams
      .getAll('authmechanism')
      .some(isMachineCredentialLogin),
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
  if (resource !== RESOURCE_IN_PATH) {
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
