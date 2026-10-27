import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import type { SqlLanguage } from 'sql-formatter'
import { format } from 'sql-formatter'

export const formatSql = (sql: string, dialect: Dialect) => {
  if (!isSqlDialect(dialect)) {
    return sql
  }
  const langMap: Record<SqlDialect, SqlLanguage> = {
    [Dialect.Postgres]: 'postgresql',
    [Dialect.MySQL]: 'mysql',
    [Dialect.MSSQL]: 'tsql',
    [Dialect.ClickHouse]: 'clickhouse',
    [Dialect.SQLite]: 'sqlite',
    [Dialect.Oracle]: 'plsql',
  }

  try {
    return format(sql, {
      keywordCase: 'upper',
      language: langMap[dialect],
    })
  } catch {
    return sql
  }
}
