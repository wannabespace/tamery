import { randomUUID } from 'node:crypto'

import { memoize } from 'memoza'

import type { RunOptions } from '../..'
import { NO_ROW_COUNT, resultSet } from '../..'
import { cancellable } from '../../cancellation'
import { getClient, parseError } from './client'

// `client.query` appends a FORMAT clause, which only a statement that returns rows accepts.
const ROW_RETURNING_COMMANDS = new Set([
  'CHECK',
  'DESC',
  'DESCRIBE',
  'EXISTS',
  'EXPLAIN',
  'SELECT',
  'SHOW',
  'WITH',
])
// Leading comments and parentheses skipped. Each comment matches exactly one way, or a text without a word backtracks exponentially.
const FIRST_WORD =
  /^(?:\s|\(|(?:--|#)[^\n]*(?:\n|$)|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?<command>\w+)/u

// A server older than a setting rejects it and fails the query (21.12 has no decimal quoting), so these are dropped per connection on UNKNOWN_SETTING.
const OUTPUT_SETTINGS = {
  output_format_json_quote_64bit_integers: 1,
  output_format_json_quote_decimals: 1,
  output_format_json_named_tuples_as_objects: 1,
  // Unquoted, NaN and ±Infinity read as null, so a row key built from them matches a row whose value is NULL.
  output_format_json_quote_denormals: 1,
}
const UNKNOWN_SETTING = /Unknown setting (?<name>\w+)/u

// An older server appends an error that stops a started stream as a plain-text row.
const rowValues = (row: { text: string; json: <T>() => T }) => {
  if (row.text.startsWith('Code: ')) {
    throw parseError(row.text)
  }
  return row.json<unknown[]>()
}

const unknownSettingsOf = memoize(
  (_connectionString: string) => new Set<string>()
)

const bigIntegerType = /^(?:Nullable\()?U?Int(?:64|128|256)\b/u

// Quoted so a value past 2^53 survives `JSON.parse`; a safe one goes back to a number, as catalog reads expect.
const unquoteSafeIntegers = (meta: { type: string }[], data: unknown[][]) => {
  const indexes = meta.flatMap((column, index) =>
    bigIntegerType.test(column.type) ? [index] : []
  )
  for (const row of data) {
    for (const index of indexes) {
      const value = row[index]
      if (typeof value === 'string' && Number.isSafeInteger(Number(value))) {
        row[index] = Number(value)
      }
    }
  }
  return data
}

export const runQuery = ({
  connectionString,
  maxRows = Infinity,
  query: sql,
  queryId,
  readOnly,
}: {
  connectionString: string
  query: string
  readOnly?: boolean
} & RunOptions) => {
  const client = getClient(connectionString)
  const controller = new AbortController()
  const clickhouseQueryId = randomUUID()
  const start = performance.now()

  const cancel = async () => {
    try {
      const ready = await client
      await ready.command({
        query: 'KILL QUERY WHERE query_id = {id:String}',
        query_params: { id: clickhouseQueryId },
      })
    } finally {
      controller.abort()
    }
  }

  return cancellable({ cancel, connectionString, queryId }, async () => {
    const ready = await client
    const command = FIRST_WORD.exec(sql)?.groups?.command?.toUpperCase() ?? ''
    if (!ROW_RETURNING_COMMANDS.has(command)) {
      await ready.command({
        abort_signal: controller.signal,
        // 2, not 1: 1 also forbids the output settings every query passes.
        ...(readOnly && { clickhouse_settings: { readonly: '2' } }),
        query: sql,
        query_id: clickhouseQueryId,
      })
      return {
        duration: performance.now() - start,
        result: [
          resultSet(
            { affectedRows: NO_ROW_COUNT, columns: [], rows: [] },
            maxRows
          ),
        ],
      }
    }

    const unknownSettings = unknownSettingsOf(connectionString)
    const send = async (): ReturnType<typeof ready.query> => {
      try {
        return await ready.query({
          abort_signal: controller.signal,
          clickhouse_settings: {
            ...Object.fromEntries(
              Object.entries(OUTPUT_SETTINGS).filter(
                ([name]) => !unknownSettings.has(name)
              )
            ),
            ...(readOnly && { readonly: '2' }),
            // One row past the cap is how `truncated` finds out there were more.
            ...(Number.isFinite(maxRows) && {
              max_result_rows: String(maxRows + 1),
              result_overflow_mode: 'break',
            }),
          },
          format: 'JSONCompactEachRowWithNamesAndTypes',
          query: sql,
          query_id: clickhouseQueryId,
        })
      } catch (error) {
        const name =
          error instanceof Error
            ? UNKNOWN_SETTING.exec(error.message)?.groups?.name
            : undefined
        if (!name || !(name in OUTPUT_SETTINGS) || unknownSettings.has(name)) {
          throw error
        }
        unknownSettings.add(name)
        return send()
      }
    }
    const response = await send()
    // `break` overflows to the end of a block, so the read itself stops at the cap. The first two rows are the names and types.
    const header: unknown[][] = []
    const rows: unknown[][] = []
    for await (const batch of response.stream()) {
      for (const row of batch) {
        if (header.length < 2) {
          header.push(rowValues(row))
        } else if (rows.length <= maxRows) {
          rows.push(rowValues(row))
        }
      }
      if (rows.length > maxRows) {
        break
      }
    }
    const [names = [], types = []] = header
    const meta = names.map((name, index) => ({
      name: String(name),
      type: String(types[index]),
    }))
    return {
      duration: performance.now() - start,
      result: [
        resultSet(
          {
            affectedRows: NO_ROW_COUNT,
            columns: meta.map((column) => column.name),
            rows: unquoteSafeIntegers(meta, rows),
          },
          maxRows
        ),
      ],
    }
  })
}
