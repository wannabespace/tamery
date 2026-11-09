import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  McpAccess,
  McpCall,
  McpRequest,
  McpTarget,
  McpTool,
} from '@tamery/shared/mcp'
import { DEFAULT_MCP_ACCESS, MCP_MAX_ROWS } from '@tamery/shared/mcp'
import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'
import { app } from 'electron'
import { z } from 'zod'

import { askRenderer } from './mcp-renderer'

const jsonContent = (value: unknown) => ({
  content: [
    {
      text: JSON.stringify(value, (_key, item) =>
        typeof item === 'bigint' ? item.toString() : item
      ),
      type: 'text' as const,
    },
  ],
})

const targetInput = {
  connectionId: z.string().describe('Id from list_connections'),
  resource: z
    .string()
    .optional()
    .describe(
      "Resource (a database) from list_connections; defaults to the connection's own database"
    ),
}

const sqlInput = { ...targetInput, sql: z.string() }

const INSTRUCTIONS = `Tamery is the user's database client. Start with list_connections, then read the schema with list_tables and describe_table before writing SQL in the connection's own dialect. A MongoDB connection takes mongosh calls instead of SQL, one per statement: db.orders.find({ status: "paid" }).limit(20), db.orders.aggregate([...]), db.runCommand({ ... }); a collection is its table and a field its column, and Extended JSON values ({ "$oid": … }) are written back as ObjectId("…") and the like. When the user names a record, value or thing to change, it almost always lives in the data, not in Tamery: connection names are only labels. Find it before answering — pick the likely tables from their names and columns, search them with query using case-insensitive partial matches (e.g. LOWER(column) LIKE '%value%'), and if several rows or connections could match, show the candidates and ask which one. query only reads; execute changes data or schema where the connection's access allows it, and on "ask" the user approves or declines each statement in Tamery, so explain in your reply what it changes. Results stop at ${MCP_MAX_ROWS} rows, so filter or aggregate in SQL instead of reading whole tables. No tool adds, edits or removes a connection: the user does that in Tamery or with the tamery CLI.`

export const createMcpServer = (
  access: () => Record<string, McpAccess>,
  logCall: (call: Omit<McpCall, 'client' | 'id'>) => void
) => {
  const server = new McpServer(
    { name: 'tamery', version: app.getVersion() },
    { instructions: INSTRUCTIONS }
  )

  const getAccess = (connectionId: string): McpAccess =>
    access()[connectionId] ?? DEFAULT_MCP_ACCESS

  const getSharedAccess = (connectionId: string) => {
    const connectionAccess = getAccess(connectionId)
    if (connectionAccess === 'off') {
      throw new Error(
        `Connection "${connectionId}" is not shared with agents. The user can share it in Tamery → Settings → MCP.`
      )
    }
    return connectionAccess
  }

  const askShared = (
    request: Extract<McpRequest, { args: McpTarget }>,
    signal: AbortSignal
  ) => {
    getSharedAccess(request.args.connectionId)
    return askRenderer(request, signal)
  }

  const runLogged = async (
    tool: McpTool,
    call: Partial<McpTarget & Pick<McpCall, 'detail' | 'query'>>,
    run: () => Promise<unknown>
  ) => {
    const at = Date.now()
    const result = await Result.tryPromise(run)
    const {
      connectionId = null,
      detail = null,
      query = null,
      resource = null,
    } = call
    logCall({
      at,
      connectionId,
      detail,
      error: result.isErr() ? toError(result.error.cause).message : null,
      query,
      resource,
      tool,
    })
    if (result.isErr()) {
      throw result.error.cause
    }
    return jsonContent(result.value)
  }

  server.registerTool(
    'list_connections',
    {
      annotations: { readOnlyHint: true },
      description:
        'List the database connections saved in Tamery: id, name, the label the user groups it under (e.g. prod, staging; several connections can share a name and differ only by label), engine, the resources (databases) opened in it, and the access the user gave agents: "read" (query only), "ask" (each execute waits for the user to approve it) or "write" (execute runs at once).',
    },
    ({ signal }) =>
      runLogged('list_connections', {}, async () => {
        const connections = await askRenderer(
          { args: undefined, method: 'connections' },
          signal
        )
        return connections.flatMap((connection) => {
          const connectionAccess = getAccess(connection.id)
          return connectionAccess === 'off'
            ? []
            : [{ ...connection, access: connectionAccess }]
        })
      })
  )

  server.registerTool(
    'query',
    {
      annotations: { readOnlyHint: true },
      description: `Run one read-only SQL statement on a Tamery connection, in the connection's own SQL dialect. Statements that write are rejected; on MongoDB that is any call but find, findOne, aggregate without $out or $merge, the counts, distinct and the read commands. PostgreSQL, MySQL, Oracle, ClickHouse, SQLite and MongoDB also run it read-only, and every engine but ClickHouse, which has no transactions, rolls it back; a function with side effects can still act, so only a read-only database login guarantees no writes. At most ${MCP_MAX_ROWS} rows come back; "truncated" says there were more. Read the schema with list_tables and describe_table first.`,
      inputSchema: sqlInput,
    },
    (args, { signal }) =>
      runLogged('query', { ...args, query: args.sql }, () =>
        askShared({ args, method: 'query' }, signal)
      )
  )

  server.registerTool(
    'list_tables',
    {
      annotations: { readOnlyHint: true },
      description:
        'List the schemas of a Tamery connection with their tables and views. In MySQL, ClickHouse and MongoDB a schema is a database (MongoDB lists its collections as tables), in Oracle a user. Pass schema to list only that one on a large database.',
      inputSchema: {
        ...targetInput,
        schema: z.string().optional(),
      },
    },
    (args, { signal }) =>
      runLogged('list_tables', { ...args, detail: args.schema }, () =>
        askShared({ args, method: 'tables' }, signal)
      )
  )

  server.registerTool(
    'describe_table',
    {
      annotations: { readOnlyHint: true },
      description:
        'Describe one table or view: its columns (type, nullability, default, enum values), constraints (primary key, foreign keys with what they reference, unique, check) and indexes.',
      inputSchema: {
        ...targetInput,
        schema: z.string().describe('Schema from list_tables'),
        table: z.string(),
      },
    },
    (args, { signal }) =>
      runLogged(
        'describe_table',
        { ...args, detail: `${args.schema}.${args.table}` },
        () => askShared({ args, method: 'describeTable' }, signal)
      )
  )

  server.registerTool(
    'execute',
    {
      annotations: { destructiveHint: true, readOnlyHint: false },
      description: `Run one SQL statement that may change data or schema, on a Tamery connection whose access is "ask" or "write", in the connection's own SQL dialect, or one mongosh call on MongoDB. It commits; wrap several statements in BEGIN … COMMIT to run them as one transaction (on Oracle, in one PL/SQL BEGIN … END; block ending in COMMIT), except on ClickHouse and MongoDB, which run one statement at a time. On "ask" it waits until the user approves it in Tamery, and fails if they decline. Use query for reads. At most ${MCP_MAX_ROWS} rows come back.`,
      inputSchema: sqlInput,
    },
    (args, { signal }) =>
      runLogged('execute', { ...args, query: args.sql }, async () => {
        const connectionAccess = getSharedAccess(args.connectionId)
        if (connectionAccess === 'read') {
          throw new Error(
            `Connection "${args.connectionId}" is read-only for agents. The user can allow writes in Tamery → Settings → MCP.`
          )
        }
        const approve = connectionAccess === 'ask'
        const bounce = approve ? app.dock?.bounce('critical') : undefined
        try {
          return await askRenderer(
            { args: { ...args, approve }, method: 'execute' },
            signal
          )
        } finally {
          if (bounce !== undefined) {
            app.dock?.cancelBounce(bounce)
          }
        }
      })
  )

  return server
}
