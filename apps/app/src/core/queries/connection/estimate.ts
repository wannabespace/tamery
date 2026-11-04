import type { Dialect } from '@tamery/shared/enums/connection-type'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import { dialects, splitStatements } from '@tamery/sql'
import type { Type } from 'arktype'
import { type } from 'arktype'
import { CompiledQuery } from 'kysely'

import { getCapabilities } from '~/core/catalog/capabilities'
import { createQuery } from '~/core/runtime/query'

import { runInTransaction } from './transaction'

const postgresRows = type([
  {
    Plan: {
      'Node Type': 'string',
      'Plan Rows': 'number',
      'Plans?': type({ 'Plan Rows': 'number' }).array(),
    },
  },
]).pipe(
  ([{ Plan }]) =>
    (Plan['Node Type'] === 'ModifyTable'
      ? Plan.Plans?.[0]?.['Plan Rows']
      : Plan['Plan Rows']) ?? null
)

// Only a statement that opens with a data verb: EXPLAIN takes no `ANALYZE …` or procedure call that would make it run. Planning can still call its functions (architecture.md → MCP server).
const ESTIMATED_COMMANDS = new Set([
  'DELETE',
  'INSERT',
  'MERGE',
  'REPLACE',
  'UPDATE',
])

export const estimateQuery = (text: string, dialect: Dialect) => {
  if (
    !(
      isSqlDialect(dialect) &&
      getCapabilities(dialect).flags.includes('explain')
    )
  ) {
    return null
  }
  const [statement, ...rest] = splitStatements(text, dialects[dialect])
  if (
    rest.length > 0 ||
    !ESTIMATED_COMMANDS.has(statement?.tokens[0]?.text.toUpperCase() ?? '')
  ) {
    return null
  }
  return createQuery<Type<number | null>>({
    query: {
      clickhouse: unsupported('Row estimates'),
      mongodb: unsupported('Row estimates'),
      mssql: unsupported('Row estimates'),
      mysql: async (db) => {
        // Not read only: MySQL refuses even EXPLAIN of a write there.
        // MySQL 9's JSON plan has no row estimate for a single-table UPDATE or DELETE; the tabular one always has.
        const [set] = await runInTransaction(db, { commit: false }, [
          CompiledQuery.raw(`EXPLAIN FORMAT=TRADITIONAL ${text}`),
        ])
        if (!set) {
          return null
        }
        const at = (column: string) => set.columns.indexOf(column)
        const [target, ...joined] = set.rows.filter(
          (row) => row[at('id')] === set.rows[0]?.[at('id')]
        )
        const rows = target?.[at('rows')]
        if (joined.length > 0 || typeof rows !== 'number') {
          return null
        }
        return Math.round(
          (rows * Number(target?.[at('filtered')] ?? 100)) / 100
        )
      },
      oracle: unsupported('Row estimates'),
      postgres: async (db) => {
        const [set] = await runInTransaction(
          db,
          { accessMode: 'read only', commit: false },
          [CompiledQuery.raw(`EXPLAIN (FORMAT JSON) ${text}`)]
        )
        return postgresRows.assert(set?.rows[0]?.[0])
      },
      sqlite: unsupported('Row estimates'),
    },
  })
}
