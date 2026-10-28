import type { AppUIMessage } from '@tamery/ai/message'
import { MCP_MAX_ROWS } from '@tamery/shared/mcp'
import { toToolOutput } from '@tamery/shared/tool-output'
import { isToolUIPart } from 'ai'

import type { Engine } from './fixtures'
import { connectionStrings, executors } from './fixtures'

export const CONNECTION_NAMES: Record<Engine, string> = {
  mongodb: 'Shop (MongoDB)',
  mysql: 'Shop (MySQL)',
  postgres: 'Shop (PostgreSQL)',
}

const isEngine = (id: string): id is Engine => id in connectionStrings

const getEngine = (connectionId: string) => {
  if (!isEngine(connectionId)) {
    throw new Error(
      `Connection "${connectionId}" not found. Call list_connections for valid ids.`
    )
  }
  return connectionId
}

/** Reads through a read-only transaction that is always rolled back, as the app's `query` does. */
export const read = async (engine: Engine, statement: string) => {
  const executor = executors[engine]
  const { txId } = await executor.beginTransaction({
    accessMode: 'read only',
    connectionString: connectionStrings[engine],
  })
  try {
    const { result } = await executor.executeTransaction({
      maxRows: MCP_MAX_ROWS,
      query: statement,
      txId,
      values: [],
    })
    return toToolOutput(result)
  } finally {
    await executor.rollbackTransaction({ txId })
  }
}

const rowsOf = async (engine: Engine, statement: string) => {
  const [set] = await read(engine, statement)
  return set?.rows ?? []
}

const CATALOG_FILTER: Record<Exclude<Engine, 'mongodb'>, string> = {
  mysql: 'table_schema = DATABASE()',
  postgres: "table_schema NOT IN ('pg_catalog', 'information_schema')",
}

const listTables = async (engine: Engine) => {
  if (engine === 'mongodb') {
    const rows = await rowsOf(engine, 'db.getCollectionNames()')
    return {
      schemas: [
        {
          name: 'shop',
          tables: rows.map(([name]) => ({ name, type: 'table' })),
        },
      ],
    }
  }
  const rows = await rowsOf(
    engine,
    `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE ${CATALOG_FILTER[engine]} ORDER BY 1, 2`
  )
  const bySchema = Object.groupBy(rows, ([schema]) => String(schema))
  return {
    schemas: Object.entries(bySchema).map(([name, tables]) => ({
      name,
      tables: (tables ?? []).map(([, table, tableType]) => ({
        name: table,
        type: tableType === 'VIEW' ? 'view' : 'table',
      })),
    })),
  }
}

const describeTable = async (engine: Engine, schema: string, table: string) => {
  if (engine === 'mongodb') {
    const [sample] = await read(engine, `db.${table}.find().limit(20)`)
    return { columns: sample?.columns ?? [], sample: sample?.rows.slice(0, 3) }
  }
  const where = `table_schema = '${schema}' AND table_name = '${table}'`
  const [columns, keys] = await Promise.all([
    rowsOf(
      engine,
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE ${where} ORDER BY ordinal_position`
    ),
    rowsOf(
      engine,
      engine === 'postgres'
        ? `SELECT kcu.column_name, tc.constraint_type, ccu.table_name, ccu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema LEFT JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND tc.constraint_type = 'FOREIGN KEY' WHERE tc.table_schema = '${schema}' AND tc.table_name = '${table}'`
        : `SELECT column_name, constraint_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE ${where}`
    ),
  ])
  return {
    columns: columns.map(([name, type, nullable, defaultValue]) => ({
      default: defaultValue,
      name,
      nullable: nullable === 'YES',
      type,
    })),
    constraints: keys.map(([column, kind, references, referencedColumn]) => ({
      column,
      kind,
      references: references ? `${references}.${referencedColumn}` : null,
    })),
  }
}

const searchSchema = async (engine: Engine, query: string) => {
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean)
  const matches = (name: unknown) =>
    terms.some((term) => String(name).toLowerCase().includes(term))
  const { schemas } = await listTables(engine)
  const tables = schemas.flatMap((schema) =>
    schema.tables.map((table) => ({ schema: schema.name, table: table.name }))
  )
  const columns = await Promise.all(
    tables.map(async ({ schema, table }) => {
      const described = await describeTable(engine, schema, String(table))
      return described.columns.map((column) => ({
        column: typeof column === 'object' && column ? column.name : column,
        schema,
        table,
      }))
    })
  )
  return {
    columns: columns.flat().filter(({ column }) => matches(column)),
    tables: tables.filter(({ table }) => matches(table)),
    truncated: false,
  }
}

const quote = (engine: Engine, name: string) =>
  engine === 'mysql' ? `\`${name}\`` : `"${name}"`

const columnValues = async (
  engine: Engine,
  schema: string,
  table: string,
  column: string
) => {
  if (engine === 'mongodb') {
    const field = `"$${column}"`
    return {
      stats: await rowsOf(
        engine,
        `db.${table}.aggregate([{ $group: { _id: null, rows: { $sum: 1 }, min: { $min: ${field} }, max: { $max: ${field} } } }])`
      ),
      values: await rowsOf(
        engine,
        `db.${table}.aggregate([{ $group: { _id: ${field}, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }])`
      ),
    }
  }
  const from = `${quote(engine, schema)}.${quote(engine, table)}`
  const ref = quote(engine, column)
  const [[rows, filled, distinct, min, max] = []] = await rowsOf(
    engine,
    `SELECT COUNT(*), COUNT(${ref}), COUNT(DISTINCT ${ref}), MIN(${ref}), MAX(${ref}) FROM ${from}`
  )
  const values = await rowsOf(
    engine,
    `SELECT ${ref} AS value, COUNT(*) AS count FROM ${from} GROUP BY ${ref} ORDER BY count DESC LIMIT 50`
  )
  return {
    distinct,
    max,
    min,
    nulls: Number(rows) - Number(filled),
    rows,
    values: values.map(([value, count]) => ({ count, value })),
  }
}

type ToolPart = Extract<AppUIMessage['parts'][number], { toolCallId: string }>

const answer = (part: ToolPart): unknown => {
  if (part.state !== 'input-available') {
    return null
  }
  switch (part.type) {
    case 'tool-list_connections': {
      return Object.entries(CONNECTION_NAMES).map(([id, name]) => ({
        id,
        label: null,
        name,
        resources: ['shop'],
        type: id,
      }))
    }
    case 'tool-list_tables': {
      return listTables(getEngine(part.input.connectionId))
    }
    case 'tool-describe_table': {
      const { connectionId, schema, table } = part.input
      return describeTable(getEngine(connectionId), schema, table)
    }
    case 'tool-search_schema': {
      return searchSchema(getEngine(part.input.connectionId), part.input.query)
    }
    case 'tool-column_values': {
      const { column, connectionId, schema, table } = part.input
      return columnValues(getEngine(connectionId), schema, table, column)
    }
    case 'tool-propose_note': {
      return { note: null, saved: false }
    }
    case 'tool-query': {
      return read(getEngine(part.input.connectionId), part.input.sql)
    }
    default: {
      throw new Error('The user declined to run this statement.')
    }
  }
}

/** Answers every tool call the last step left open, the way the window does; nothing that writes ever runs. */
export const answerToolCalls = (message: AppUIMessage) =>
  Promise.all(
    message.parts.map(async (part) => {
      if (!(isToolUIPart(part) && part.state === 'input-available')) {
        return
      }
      const output = await Promise.resolve()
        .then(() => answer(part))
        .then(
          (value) => ({ output: value, state: 'output-available' as const }),
          (error: unknown) => ({
            errorText: error instanceof Error ? error.message : String(error),
            state: 'output-error' as const,
          })
        )
      Object.assign(part, output)
    })
  )
