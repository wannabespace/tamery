import type * as mssqlModule from 'mssql'

import type { RunOptions } from '../..'
import { NO_ROW_COUNT, resultSet } from '../..'
import { cancellable } from '../../cancellation'

interface ColumnMetadata {
  name: string
  scale?: number
  type?: { declaration?: string }
}

const DEFAULT_TIME_SCALE = 3

// mssql binds a plain `Uint8Array` (how bytes arrive over the wire and Electron IPC) as `NVarChar`; only a `Buffer` infers `VarBinary`.
const bindable = (value: unknown) =>
  value instanceof Uint8Array && !Buffer.isBuffer(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    : value

// Text, as pg and mysql give: a `Date` drops datetime2's last four digits and shifts a `time` into the viewer's zone. tedious reads every value as UTC.
const dateAsText = (value: unknown, column?: ColumnMetadata) => {
  if (!(value instanceof Date)) {
    return value
  }
  const date: Date & { nanosecondsDelta?: number } = value
  const scale = column?.scale ?? DEFAULT_TIME_SCALE
  const ticks = Math.round(
    (date.getUTCMilliseconds() / 1000 + (date.nanosecondsDelta ?? 0)) * 1e7
  )
  const fraction =
    scale === 0 ? '' : `.${String(ticks).padStart(7, '0').slice(0, scale)}`

  const iso = date.toISOString()
  const day = iso.slice(0, 10)
  const seconds = iso.slice(11, 19)
  const time = `${seconds}${fraction}`
  switch (column?.type?.declaration) {
    case 'date': {
      return day
    }
    case 'time': {
      return time
    }
    case 'smalldatetime': {
      return `${day} ${seconds}`
    }
    case 'datetimeoffset': {
      return `${day} ${time} +00:00`
    }
    default: {
      return `${day} ${time}`
    }
  }
}

export const runRequest = async (
  request: mssqlModule.Request,
  {
    batch = false,
    connectionString,
    sql,
    values,
  }: {
    batch?: boolean
    connectionString: string
    sql: string
    values: unknown[]
  },
  { maxRows = Infinity, queryId }: RunOptions
) => {
  for (const [index, value] of values.entries()) {
    request.input(`${index + 1}`, bindable(value))
  }
  request.arrayRowMode = true
  request.stream = true
  const sets: { columns: ColumnMetadata[]; rows: unknown[][] }[] = []
  const errors: Error[] = []
  request.on('recordset', (columns: ColumnMetadata[]) => {
    sets.push({ columns, rows: [] })
  })
  request.on('row', (row: unknown[]) => {
    const set = sets.at(-1)
    if (set && set.rows.length <= maxRows) {
      set.rows.push(
        row.map((value, position) => dateAsText(value, set.columns[position]))
      )
    }
  })
  // A stream reports each error as an event, then still resolves; without this listener the emit throws.
  request.on('error', (error: Error) => {
    errors.push(error)
  })
  const start = performance.now()
  const result = await cancellable(
    {
      cancel: () => Promise.resolve(request.cancel()),
      connectionString,
      queryId,
    },
    () => (batch ? request.batch(sql) : request.query(sql))
  )
  const error = errors.at(-1)
  if (error) {
    throw error
  }

  if (sets.length > 0) {
    return {
      duration: performance.now() - start,
      result: sets.map(({ columns, rows }) =>
        resultSet(
          {
            affectedRows: NO_ROW_COUNT,
            columns: columns.map((column) => column.name),
            rows,
          },
          maxRows
        )
      ),
    }
  }

  const affectedRows = result.rowsAffected.reduce((sum, n) => sum + n, 0)
  return {
    duration: performance.now() - start,
    result: [resultSet({ affectedRows, columns: [], rows: [] }, maxRows)],
  }
}
