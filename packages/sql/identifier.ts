import type { Dialect } from '@tamery/shared/enums/connection-type'

const quoteWithBackticks = (name: string) => `\`${name.replaceAll('`', '``')}\``

const quoteWithDoubleQuotes = (name: string) =>
  `"${name.replaceAll('"', '""')}"`

const QUOTE_IDENTIFIER_MAP: Record<Dialect, (name: string) => string> = {
  clickhouse: quoteWithBackticks,
  mongodb: quoteWithDoubleQuotes,
  mssql: (name) => `[${name.replaceAll(']', ']]')}]`,
  mysql: quoteWithBackticks,
  oracle: quoteWithDoubleQuotes,
  postgres: quoteWithDoubleQuotes,
  sqlite: quoteWithDoubleQuotes,
}

export const quoteIdentifier = (name: string, dialect: Dialect) =>
  QUOTE_IDENTIFIER_MAP[dialect](name)
