import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import type { SqlLanguage } from 'sql-formatter'
import { format } from 'sql-formatter'

// The ClickHouse grammar throws on `$browser` and `{filters}`, and reading them as parameters leaves them as written.
// HogQL names are case-sensitive and `event`, `events` read as keywords, so keywordCase stays 'preserve' for it.
const HOGQL_FORMAT = {
  paramTypes: {
    custom: [{ regex: String.raw`\$\w+` }, { regex: String.raw`\{\w+\}` }],
  },
}

export const formatSql = (sql: string, dialect: Dialect) => {
  if (!isSqlDialect(dialect)) {
    return sql
  }
  const langMap: Record<SqlDialect, SqlLanguage> = {
    [Dialect.Postgres]: 'postgresql',
    [Dialect.MySQL]: 'mysql',
    [Dialect.MSSQL]: 'tsql',
    [Dialect.ClickHouse]: 'clickhouse',
    [Dialect.PostHog]: 'clickhouse',
    [Dialect.SQLite]: 'sqlite',
    [Dialect.Oracle]: 'plsql',
  }

  try {
    return format(sql, {
      keywordCase: dialect === Dialect.PostHog ? 'preserve' : 'upper',
      language: langMap[dialect],
      ...(dialect === Dialect.PostHog && HOGQL_FORMAT),
    })
  } catch {
    return sql
  }
}
