import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { SafeURL } from '@tamery/shared/safe-url'
import { objectEntries } from '@tamery/shared/utils'

import { readConnectionString } from './parse-connection-string'
import { sqliteFile } from './sqlite-file'
import type { SshTunnel } from './ssh/params'
import { deleteSshParams, setSshParams, getSshTunnel } from './ssh/params'

export interface ConnectionParts {
  /** A SQLite file's path, D1's database ID. */
  database: string
  host: string
  /** ClickHouse's transport as the string named it (`https://` or `http://`); `null` infers it from the port. */
  https: boolean | null
  /** Driver options as a query string, without the leading `?` and without the `ssh_*` params. */
  options: string
  /** Also a libSQL or D1 token, so every secret path treats it as the password. */
  password: string
  port: string
  /** Read from a SQLite server's scheme; `null` for a file and every other engine. */
  provider: Provider | null
  ssh: SshTunnel | null
  type: ConnectionType | null
  user: string
}

export const DEFAULT_PORTS: Record<ConnectionType, number | null> = {
  [ConnectionType.ClickHouse]: 8123,
  [ConnectionType.MariaDB]: 3306,
  [ConnectionType.MongoDB]: 27_017,
  [ConnectionType.MSSQL]: 1433,
  [ConnectionType.MySQL]: 3306,
  [ConnectionType.Oracle]: 1521,
  [ConnectionType.Postgres]: 5432,
  [ConnectionType.SQLite]: null,
}

/** MariaDB shares MySQL's port, so a bare port names MySQL. */
export const TYPE_OF_DEFAULT_PORT: Record<string, ConnectionType> =
  Object.fromEntries(
    objectEntries(DEFAULT_PORTS)
      .filter(([type, port]) => type !== ConnectionType.MariaDB && port)
      .map(([type, port]) => [port, type])
  )

export const HTTPS_PORT = '443'
export const CLICKHOUSE_HTTPS_PORT = '8443'

export const CLICKHOUSE_HTTP_PORT_OF_NATIVE: Record<string, string> = {
  9000: String(DEFAULT_PORTS[ConnectionType.ClickHouse]),
  9440: CLICKHOUSE_HTTPS_PORT,
}

const getPort = ({
  https,
  port,
  provider,
  type,
}: Partial<Pick<ConnectionParts, 'https' | 'port' | 'provider' | 'type'>>) => {
  // SRV resolves the servers and their ports from DNS, and the driver refuses a port beside it.
  if (provider === Provider.MongoDBAtlas) {
    return ''
  }
  if (port) {
    return port
  }
  if (https && type === ConnectionType.ClickHouse) {
    return HTTPS_PORT
  }
  return String((type && DEFAULT_PORTS[type]) ?? '')
}

const TYPE_OF_NAME: Record<string, ConnectionType> = {
  ch: ConnectionType.ClickHouse,
  clickhouse: ConnectionType.ClickHouse,
  cockroachdb: ConnectionType.Postgres,
  d1: ConnectionType.SQLite,
  http: ConnectionType.ClickHouse,
  https: ConnectionType.ClickHouse,
  libsql: ConnectionType.SQLite,
  mariadb: ConnectionType.MariaDB,
  'microsoft sql server': ConnectionType.MSSQL,
  mongo: ConnectionType.MongoDB,
  mongodb: ConnectionType.MongoDB,
  mssql: ConnectionType.MSSQL,
  mysql: ConnectionType.MySQL,
  mysql2: ConnectionType.MySQL,
  oracle: ConnectionType.Oracle,
  oracledb: ConnectionType.Oracle,
  pg: ConnectionType.Postgres,
  pgsql: ConnectionType.Postgres,
  postgres: ConnectionType.Postgres,
  postgresql: ConnectionType.Postgres,
  sqlite: ConnectionType.SQLite,
  sqlite3: ConnectionType.SQLite,
  sqlserver: ConnectionType.MSSQL,
  sqlsrv: ConnectionType.MSSQL,
  tedious: ConnectionType.MSSQL,
  trilogy: ConnectionType.MySQL,
}

/** A URL scheme or a tool's driver name, never a whole URL; a `+driver` suffix (`postgresql+asyncpg`) is dropped. */
export const getConnectionType = (name: string): ConnectionType | null =>
  TYPE_OF_NAME[name.toLowerCase().replace(/\+.*$/u, '')] ?? null

/**
 * A D1 string names Cloudflare's API host, so the cloud proxy sees a public host; its executor sends the token to this
 * host whatever the string says.
 */
export const D1_HOST = 'api.cloudflare.com'

const PROVIDER_OF_SCHEME: Partial<Record<string, Provider>> = {
  d1: Provider.CloudflareD1,
  libsql: Provider.Turso,
  'mongodb+srv': Provider.MongoDBAtlas,
}

/** `null` for a scheme Tamery does not know: a SQLite server is never guessed to be one it does. */
export const getProviderOfScheme = (scheme: string) =>
  PROVIDER_OF_SCHEME[scheme] ?? null

const withCredentials = (
  base: string,
  { options, password, user }: ConnectionParts
) => {
  const url = new SafeURL(base)
  url.username = encodeURIComponent(user)
  url.password = encodeURIComponent(password)
  url.search = options
  return url
}

const PROVIDER_FORMATS: Record<Provider, (parts: ConnectionParts) => string> = {
  [Provider.CloudflareD1]: (parts) =>
    withCredentials(
      `d1://${D1_HOST}/${encodeURIComponent(parts.database)}`,
      parts
    ).toString(),
  [Provider.MongoDBAtlas]: (parts) =>
    withCredentials(
      `mongodb+srv://${parts.host}/${encodeURIComponent(parts.database)}`,
      parts
    ).toString(),
  [Provider.Turso]: (parts) =>
    withCredentials(
      `libsql://${parts.host}${parts.port ? `:${parts.port}` : ''}`,
      parts
    ).toString(),
}

/** A host without a provider formats to nothing, never to a file string. */
const formatSqlite = (parts: ConnectionParts) =>
  parts.host || !parts.database
    ? ''
    : sqliteFile.connectionString(parts.database)

const format = (
  parts: ConnectionParts,
  missingSecrets: readonly string[] = []
): string => {
  if (parts.provider) {
    return PROVIDER_FORMATS[parts.provider](parts)
  }
  if (parts.type === ConnectionType.SQLite) {
    return formatSqlite(parts)
  }
  if (!parts.type || !parts.host) {
    return ''
  }

  const port = getPort(parts)
  let scheme: string =
    parts.type === ConnectionType.MSSQL ? 'sqlserver' : parts.type
  if (parts.type === ConnectionType.ClickHouse) {
    const https =
      parts.https ?? port !== String(DEFAULT_PORTS[ConnectionType.ClickHouse])
    scheme = https ? 'https' : 'http'
  }
  const host =
    parts.host.includes(':') && !parts.host.startsWith('[')
      ? `[${parts.host}]`
      : parts.host
  const url = withCredentials(
    `${scheme}://${host}:${port}/${encodeURIComponent(parts.database)}`,
    parts
  )
  if (parts.ssh?.host) {
    setSshParams(url.searchParams, parts.ssh, missingSecrets)
  }
  return url.toString()
}

const HTTPS_OF_SCHEME: Record<string, boolean> = { http: false, https: true }

const AUTH_TOKEN_PARAM = 'authtoken'

const parse = (connectionString: string): ConnectionParts => {
  const { scheme, searchParams, ...parts } =
    readConnectionString(connectionString)
  const ssh = getSshTunnel(searchParams)
  deleteSshParams(searchParams)
  const type = getConnectionType(scheme)
  if (type === ConnectionType.SQLite && parts.host) {
    parts.password = searchParams.get(AUTH_TOKEN_PARAM) ?? parts.password
    searchParams.delete(AUTH_TOKEN_PARAM)
  } else if (type === ConnectionType.SQLite) {
    parts.database = sqliteFile.path(connectionString)
  }

  return {
    ...parts,
    https: HTTPS_OF_SCHEME[scheme] ?? null,
    options: searchParams.toString(),
    provider: parts.host ? getProviderOfScheme(scheme) : null,
    ssh,
    type,
  }
}

export const connectionParts = { format, parse, port: getPort }
