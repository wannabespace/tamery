import { objectEntries } from '../utils'

export enum ConnectionType {
  Postgres = 'postgres',
  MySQL = 'mysql',
  MariaDB = 'mariadb',
  MSSQL = 'mssql',
  ClickHouse = 'clickhouse',
  SQLite = 'sqlite',
  Oracle = 'oracle',
  MongoDB = 'mongodb',
}

/** Never build a query from a `ConnectionType`: every query runs on the dialect it speaks through. */
export enum Dialect {
  Postgres = 'postgres',
  MySQL = 'mysql',
  MSSQL = 'mssql',
  ClickHouse = 'clickhouse',
  SQLite = 'sqlite',
  Oracle = 'oracle',
  MongoDB = 'mongodb',
}

export enum QueryLanguage {
  SQL = 'sql',
  Mongosh = 'mongosh',
}

// `satisfies`, never `: Record<…>`: the annotation would widen each value to
// `QueryLanguage` and collapse `SqlDialect` to every dialect.
export const dialectLanguage = {
  [Dialect.Postgres]: QueryLanguage.SQL,
  [Dialect.MySQL]: QueryLanguage.SQL,
  [Dialect.MSSQL]: QueryLanguage.SQL,
  [Dialect.ClickHouse]: QueryLanguage.SQL,
  [Dialect.SQLite]: QueryLanguage.SQL,
  [Dialect.Oracle]: QueryLanguage.SQL,
  [Dialect.MongoDB]: QueryLanguage.Mongosh,
} satisfies Record<Dialect, QueryLanguage>

export type SqlDialect = {
  [K in Dialect]: (typeof dialectLanguage)[K] extends QueryLanguage.SQL
    ? K
    : never
}[Dialect]

export const isSqlDialect = (dialect: Dialect): dialect is SqlDialect =>
  dialectLanguage[dialect] === QueryLanguage.SQL

const DIALECT_OF_TYPE: Record<ConnectionType, Dialect> = {
  [ConnectionType.ClickHouse]: Dialect.ClickHouse,
  [ConnectionType.MariaDB]: Dialect.MySQL,
  [ConnectionType.MongoDB]: Dialect.MongoDB,
  [ConnectionType.MSSQL]: Dialect.MSSQL,
  [ConnectionType.MySQL]: Dialect.MySQL,
  [ConnectionType.Oracle]: Dialect.Oracle,
  [ConnectionType.Postgres]: Dialect.Postgres,
  [ConnectionType.SQLite]: Dialect.SQLite,
}

export const getDialect = (type: ConnectionType) => DIALECT_OF_TYPE[type]

export const connectionTypeLabels: Record<ConnectionType, string> = {
  [ConnectionType.ClickHouse]: 'ClickHouse',
  [ConnectionType.MariaDB]: 'MariaDB',
  [ConnectionType.MongoDB]: 'MongoDB',
  [ConnectionType.MSSQL]: 'Microsoft SQL Server',
  [ConnectionType.MySQL]: 'MySQL',
  [ConnectionType.Oracle]: 'Oracle',
  [ConnectionType.Postgres]: 'PostgreSQL',
  [ConnectionType.SQLite]: 'SQLite',
}

export enum Provider {
  CloudflareD1 = 'cloudflare_d1',
  MongoDBAtlas = 'mongodb_atlas',
  Turso = 'turso',
}

export const providers: Record<
  Provider,
  { hidden?: boolean; label: string; type: ConnectionType }
> = {
  [Provider.CloudflareD1]: {
    label: 'Cloudflare D1',
    type: ConnectionType.SQLite,
  },
  // Its form equals MongoDB's and a pasted mongodb+srv:// URL sets this provider on its own, so it is not offered as a separate engine — only resolved for connections that already use it.
  [Provider.MongoDBAtlas]: {
    hidden: true,
    label: 'MongoDB Atlas',
    type: ConnectionType.MongoDB,
  },
  [Provider.Turso]: { label: 'Turso', type: ConnectionType.SQLite },
}

/** A type appears bare and once per provider, so a list of these is keyed by `label`, never by `type`. */
export const engines = Object.values(ConnectionType).flatMap((type) => [
  { label: connectionTypeLabels[type], provider: null, type },
  ...objectEntries(providers)
    .filter(([, provider]) => provider.type === type)
    .map(([provider, { label }]) => ({ label, provider, type })),
])
