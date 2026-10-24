import { Dialect, isSqlDialect } from '@tamery/shared/enums/connection-type'

import type { GeneratorFormat } from './types'

const DRIZZLE_DIALECTS = [
  Dialect.MSSQL,
  Dialect.MySQL,
  Dialect.Postgres,
  Dialect.SQLite,
] as const

export type DrizzleDialect = (typeof DRIZZLE_DIALECTS)[number]

export const isDrizzleDialect = (dialect: Dialect): dialect is DrizzleDialect =>
  DRIZZLE_DIALECTS.some((drizzleDialect) => drizzleDialect === dialect)

const SQL_DIALECTS = Object.values(Dialect).filter(isSqlDialect)

export const GENERATOR_COMPATIBILITY: Partial<
  Record<GeneratorFormat, readonly Dialect[]>
> = {
  drizzle: DRIZZLE_DIALECTS,
  kysely: SQL_DIALECTS,
  prisma: [Dialect.Postgres, Dialect.MySQL, Dialect.MSSQL],
  sql: SQL_DIALECTS,
}
