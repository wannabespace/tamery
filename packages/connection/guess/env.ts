import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { objectEntries } from '@tamery/shared/utils'

import { connectionParts, getConnectionType } from '../connection-parts'
import { mergeParts } from './parts'
import type { DatabaseGuess, GuessedParts, ServerField } from './types'

interface VariableGroup {
  type?: ConnectionType
  prefix: string
  /** A group with a user reads only its password (`MYSQL_ROOT_HOST` is an allow-list, not a host) and implies the user when nothing else named one. */
  user?: string
}

const SUFFIXES_OF_FIELD: Record<ServerField, string[]> = {
  database: ['DATABASE', 'DBNAME', 'DB', 'NAME', 'SERVICE_NAME'],
  host: ['HOST', 'HOSTNAME', 'SERVER', 'ENDPOINT', 'ADDRESS'],
  password: ['PASSWORD', 'PASS', 'PWD', 'AUTH_TOKEN'],
  port: ['PORT'],
  user: ['USER', 'USERNAME'],
}
const TYPE_SUFFIXES = [
  'CONNECTION',
  'PROVIDER',
  'TYPE',
  'DRIVER',
  'DIALECT',
  'ENGINE',
  'CLIENT',
  'ADAPTER',
]
const HOST_AND_PORT = /^(?<host>[^:\s]+):(?<port>\d+)$/u
const PUBLISHED_PORT =
  /^\s*-\s*["']?(?:[\d.]+:)?(?<published>\d+):(?<target>\d+)(?:\/tcp)?["']?\s*$/gmu
const UNPACKED_TEMPLATE = /\$\{|<%|process\.env/u
const BARE_SUFFIXES = new Set(['NAME', 'SERVICE_NAME'])

const GROUPS: VariableGroup[] = [
  { prefix: 'PG', type: ConnectionType.Postgres },
  { prefix: 'POSTGRES_', type: ConnectionType.Postgres },
  { prefix: 'MYSQL_', type: ConnectionType.MySQL },
  { prefix: 'MARIADB_', type: ConnectionType.MariaDB },
  { prefix: 'MYSQL_ROOT_', type: ConnectionType.MySQL, user: 'root' },
  { prefix: 'MARIADB_ROOT_', type: ConnectionType.MariaDB, user: 'root' },
  { prefix: 'CLICKHOUSE_', type: ConnectionType.ClickHouse },
  { prefix: 'MSSQL_', type: ConnectionType.MSSQL },
  { prefix: 'MSSQL_SA_', type: ConnectionType.MSSQL, user: 'sa' },
  { prefix: 'SA_', type: ConnectionType.MSSQL, user: 'sa' },
  { prefix: 'ORACLE_', type: ConnectionType.Oracle },
  // The official image's root user lives in admin, which a string without a database authenticates against; its MONGO_INITDB_DATABASE only names the init scripts' database.
  { prefix: 'MONGO_INITDB_ROOT_', type: ConnectionType.MongoDB },
  { prefix: 'MONGODB_', type: ConnectionType.MongoDB },
  { prefix: 'MONGODB_ROOT_', type: ConnectionType.MongoDB, user: 'root' },
  { prefix: 'TURSO_' },
  { prefix: 'LIBSQL_' },
  { prefix: 'SPRING.DATASOURCE.' },
  { prefix: 'QUARKUS.DATASOURCE.' },
  { prefix: 'DB_' },
  { prefix: 'DATABASE_' },
  { prefix: '' },
]

const LINE =
  /^\s*(?:-\s+)?(?:export\s+)?["']?(?<key>[\w.-]+)["']?\s*(?:=|:(?=\s|$))\s*(?<value>.*)$/u
const QUOTED = /^(?<quote>["'`])(?<inner>.*)\k<quote>/u
const UNQUOTED_TAIL = /\s+#.*$|,$/u

/** Keys must be uppercase. */
export const partsOfVariables = (
  variables: Record<string, string>
): GuessedParts | null => {
  const valueOf = (keys: string[]) =>
    keys
      .map((key) => variables[key])
      .find((value) => value && !UNPACKED_TEMPLATE.test(value)) ?? ''
  let parts: GuessedParts = {}
  let type: GuessedParts['type']

  for (const group of GROUPS) {
    const named =
      group.type ??
      TYPE_SUFFIXES.values()
        .map((suffix) =>
          getConnectionType(
            variables[group.prefix + suffix]?.split('.').at(-1) ?? ''
          )
        )
        .find(Boolean)
    const found: GuessedParts = {}
    for (const [field, suffixes] of objectEntries(SUFFIXES_OF_FIELD)) {
      if (!group.user || field === 'password') {
        found[field] = valueOf(
          suffixes
            .filter(
              (suffix) => group.prefix || named || !BARE_SUFFIXES.has(suffix)
            )
            .map((suffix) => group.prefix + suffix)
        )
      }
    }
    const address = HOST_AND_PORT.exec(found.host ?? '')?.groups
    if (address) {
      found.host = address.host
      found.port ||= address.port
    }
    if (
      !Object.values(found).some(Boolean) ||
      (!group.prefix && !named && !found.database && !found.password)
    ) {
      continue
    }
    if (!group.user || (!parts.user && !parts.password)) {
      parts = mergeParts(parts, { user: group.user, ...found })
    }
    type ??= named
  }

  return Object.keys(parts).length > 0 ? mergeParts(parts, { type }) : null
}

/** Keys come back uppercased. */
export const variablesOfLines = (lines: string[]) => {
  const variables: Record<string, string> = {}
  for (const line of lines) {
    const { key, value = '' } = LINE.exec(line)?.groups ?? {}
    if (key) {
      variables[key.toUpperCase()] ??=
        QUOTED.exec(value.trim())?.groups?.inner ??
        value.replace(UNQUOTED_TAIL, '').trim()
    }
  }
  return variables
}

export const guessEnv = (text: string): DatabaseGuess | null => {
  const parts = partsOfVariables(variablesOfLines(text.split('\n')))
  if (!parts) {
    return null
  }
  const composeTarget = connectionParts.port({ type: parts.type })
  const published =
    !parts.port &&
    composeTarget &&
    text
      .matchAll(PUBLISHED_PORT)
      .find(({ groups }) => groups?.target === composeTarget)?.groups?.published
  return {
    format: 'env',
    parts: published ? { host: 'localhost', ...parts, port: published } : parts,
  }
}
