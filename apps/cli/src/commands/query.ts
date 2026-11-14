import process from 'node:process'

import { createORPCErrorConstructorMap } from '@orpc/contract'
import { ORPCError } from '@orpc/server'
import type { ResultSet } from '@tamery/connection/queries'
import { confineDuckdbFiles } from '@tamery/connection/queries/dialects/duckdb/instances'
import { confineSqliteFiles } from '@tamery/connection/queries/dialects/sqlite/client'
import { executors } from '@tamery/connection/queries/executors'
import { readsOnly as mongoReadsOnly } from '@tamery/mongo/effects'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { getDialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import { silently } from '@tamery/shared/utils'
import { dialects, readsOnly as sqlReadsOnly } from '@tamery/sql'
import { Result } from 'better-result'

import { analytics } from '../analytics'
import { api } from '../api'
import { connections } from '../bridge/connections'
import type { QueryErrors } from '../bridge/errors'
import { queryErrors } from '../bridge/errors'
import { printable } from '../bridge/printable'
import { enableSshTunnels } from '../bridge/ssh'
import { askInTerminal } from '../bridge/terminal-question'
import { paint } from '../paint'
import { getAccount } from '../sign-in'
import { findConnection, readConnectionString } from './connection'

export const FORMATS = ['table', 'json', 'csv'] as const

const MAX_CELL_WIDTH = 60

const errors: QueryErrors = createORPCErrorConstructorMap(queryErrors)

const bigintAsText = (_key: string, item: unknown) =>
  typeof item === 'bigint' ? item.toString() : item

const getServerConnectionString = async (id: string) => {
  const server = await api.connections.resolve({ id })
  if (server.status !== 'modified') {
    throw errors.NOT_FOUND()
  }
  return server.connectionString
}

/**
 * The bridge's own checks: a string a teammate edited to open a file or sign in with this computer's credentials runs only
 * once someone at this terminal allows it, and secrets that never synced are asked for here and kept like the bridge's.
 */
const resolveConnectionString = async (
  { id, name }: { id: string; name: string },
  dialect: Dialect,
  resourceName: string | undefined
) => {
  const resolved = await Result.tryPromise(() =>
    connections.resolve(
      { connectionId: id, resourceName: resourceName ?? null },
      dialect,
      errors
    )
  )
  if (resolved.isOk()) {
    return resolved.value
  }
  const { cause } = resolved.error
  const needs =
    cause instanceof ORPCError &&
    (cause.code === 'NEEDS_SECRETS' || cause.code === 'UNCONFIRMED')
      ? cause.code
      : null
  if (!needs) {
    throw cause
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      needs === 'NEEDS_SECRETS'
        ? `This computer does not have the secrets of ${paint.bold(name)} yet. Run the query once in a terminal to enter them.`
        : `${paint.bold(name)} opens a file or signs in with credentials from this computer. Run the query once in a terminal to allow it.`
    )
  }
  const connectionString =
    needs === 'NEEDS_SECRETS'
      ? await readConnectionString(`Connection string of ${name}`)
      : await getServerConnectionString(id)
  const allowed = await connections.save(
    { connectionId: id, connectionString },
    errors,
    async (access) =>
      (await askInTerminal(
        `Allow ${paint.bold(name)} to use ${access.map((item) => paint.bold(printable(item))).join(', ')} on this computer?`
      )) === true
  )
  if (!allowed) {
    throw new Error(`Did not allow ${paint.bold(name)}.`)
  }
  // A connection can need both: access allowed first, then the secrets its server copy lacks.
  return resolveConnectionString({ id, name }, dialect, resourceName)
}

const run = async ({
  connectionString,
  dialect,
  maxRows,
  sql,
  write,
}: {
  connectionString: string
  dialect: Dialect
  maxRows: number
  sql: string
  write: boolean
}) => {
  const executor = executors[dialect]
  if (write) {
    return executor.execute({ connectionString, maxRows, query: sql })
  }
  const readOnly = isSqlDialect(dialect)
    ? sqlReadsOnly(sql, dialects[dialect])
    : mongoReadsOnly(sql)
  if (!readOnly) {
    throw new Error(
      `Without ${paint.flag('--write')}, one read-only statement runs at a time, such as SELECT, SHOW, EXPLAIN, or a MongoDB find or aggregate.`
    )
  }
  const { txId } = await executor.beginTransaction({
    accessMode: 'read only',
    connectionString,
  })
  try {
    return await executor.executeTransaction({
      maxRows,
      query: sql,
      txId,
      values: [],
    })
  } finally {
    await silently(() => executor.rollbackTransaction({ txId }))
  }
}

const toText = (value: unknown) => {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, bigintAsText)
  }
  return String(value)
}

const toCell = (value: unknown) => {
  const text = printable(toText(value).replaceAll(/\s+/gu, ' '))
  return text.length > MAX_CELL_WIDTH
    ? `${text.slice(0, MAX_CELL_WIDTH - 1)}…`
    : text
}

const countRows = (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`

const printTable = ({ affectedRows, columns, rows, truncated }: ResultSet) => {
  if (columns.length === 0) {
    console.log(
      paint.dim(
        affectedRows === null ? 'Done' : `${countRows(affectedRows)} changed`
      )
    )
    return
  }
  const headers = columns.map(toCell)
  const cells = rows.map((row) => row.map(toCell))
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...cells.map((row) => row[index]?.length ?? 0))
  )
  const line = (values: string[]) =>
    values
      .map((value, index) => value.padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd()
  console.log(paint.bold(line(headers)))
  for (const row of cells) {
    console.log(line(row))
  }
  console.log(
    paint.dim(
      truncated
        ? `First ${rows.length} rows. Pass --max-rows for more.`
        : countRows(rows.length)
    )
  )
}

// Redirected CSV keeps every byte; only what lands on a terminal loses the control characters that would drive it.
const csvField = (value: unknown) => {
  const text = process.stdout.isTTY ? printable(toText(value)) : toText(value)
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const printCsv = ({ columns, rows, truncated }: ResultSet) => {
  for (const row of [columns, ...rows]) {
    console.log(row.map(csvField).join(','))
  }
  if (truncated) {
    process.stderr.write(
      `First ${rows.length} rows. Pass --max-rows for more.\n`
    )
  }
}

const readSql = async (sql: string | undefined) => {
  const given = sql ?? (process.stdin.isTTY ? '' : await Bun.stdin.text())
  if (!given.trim()) {
    throw new Error(
      'Pass the statement after the connection, or pipe it in: tamery query <connection> < query.sql'
    )
  }
  return given.trim()
}

export const query = async (options: {
  connection: string
  database: string | undefined
  format: (typeof FORMATS)[number]
  'max-rows': string
  sql: string | undefined
  write: boolean | undefined
}) => {
  const maxRows = Number(options['max-rows'])
  if (!Number.isInteger(maxRows) || maxRows < 1) {
    throw new Error('--max-rows must be a whole number above 0.')
  }
  const sql = await readSql(options.sql)
  await getAccount(!!process.stdin.isTTY)
  const found = await findConnection(options.connection)
  const dialect = getDialect(found.type)
  enableSshTunnels()
  confineDuckdbFiles()
  confineSqliteFiles()
  const connectionString = await resolveConnectionString(
    found,
    dialect,
    options.database
  )
  const write = !!options.write
  const ran = await Result.tryPromise(() =>
    run({ connectionString, dialect, maxRows, sql, write })
  )
  await analytics.capture('query_run', {
    duration_ms: ran.isOk() ? Math.round(ran.value.duration) : null,
    format: options.format,
    rows: ran.isOk()
      ? ran.value.result.reduce((total, { rows }) => total + rows.length, 0)
      : 0,
    success: ran.isOk(),
    type: dialect,
    write,
  })
  if (ran.isErr()) {
    throw ran.error.cause
  }
  const { result } = ran.value
  if (options.format === 'json') {
    console.log(JSON.stringify(result, bigintAsText, 2))
    return
  }
  for (const [index, set] of result.entries()) {
    if (index > 0) {
      console.log('')
    }
    if (options.format === 'csv') {
      printCsv(set)
    } else {
      printTable(set)
    }
  }
}
