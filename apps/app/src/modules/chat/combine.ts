import * as SQLite from '@journeyapps/wa-sqlite'
import SQLiteESMFactory from '@journeyapps/wa-sqlite/dist/wa-sqlite.mjs'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { MCP_MAX_ROWS } from '@tamery/shared/mcp'
import { toToolOutput } from '@tamery/shared/tool-output'

import { uniqueColumns } from '~/core/table/result-grid'

import { findChatResult } from './chat-results'

let loading: Promise<SQLiteAPI> | null = null

type SQLiteAPI = ReturnType<typeof SQLite.Factory>

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

const toSqliteValue = (value: unknown) => {
  if (typeof value === 'boolean') {
    return Number(value)
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value
  }
  return JSON.stringify(value)
}

/** Runs SQLite over result sets the chat already fetched, each loaded as a table of its own, in a database that lives for this one call. */
export const combineResults = async (
  messages: AppUIMessage[],
  { inputs, statement }: ChatTools['combine']['input']
) => {
  loading ??= SQLiteESMFactory().then((module) => SQLite.Factory(module))
  const sqlite3 = await loading
  const db = await sqlite3.open_v2(':memory:')
  try {
    for (const { name, toolCallId } of inputs) {
      const set = findChatResult(messages, toolCallId)
      const columns = uniqueColumns(set.columns)
      // oxlint-disable-next-line no-await-in-loop
      await sqlite3.exec(
        db,
        `CREATE TABLE ${quote(name)} (${columns.map(quote).join(', ')})`
      )
      // oxlint-disable-next-line no-await-in-loop
      for await (const insert of sqlite3.statements(
        db,
        `INSERT INTO ${quote(name)} VALUES (${columns.map(() => '?').join(', ')})`
      )) {
        for (const row of set.rows) {
          sqlite3.bind_collection(insert, row.map(toSqliteValue))
          // oxlint-disable-next-line no-await-in-loop
          await sqlite3.step(insert)
          // oxlint-disable-next-line no-await-in-loop
          await sqlite3.reset(insert)
        }
      }
    }
    const rows: unknown[][] = []
    let columns: string[] = []
    await sqlite3.exec(db, statement, (row, names) => {
      columns = names
      rows.push(row)
    })
    return toToolOutput([
      {
        affectedRows: null,
        columns,
        rows: rows.slice(0, MCP_MAX_ROWS),
        truncated: rows.length > MCP_MAX_ROWS,
      },
    ])
  } finally {
    await sqlite3.close(db)
  }
}
