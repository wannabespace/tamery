import {
  PROPOSE_CHANGE_DESCRIPTION,
  agentChangeType,
} from '@tamery/shared/agent-change'
import type { ConnectionType } from '@tamery/shared/enums/connection-type'
import { FILTER_OPERATORS } from '@tamery/shared/filters'
import {
  COLUMN_VALUES_DESCRIPTION,
  EXPLAIN_DESCRIPTION,
  MCP_RESULT_LIMITS,
  SEARCH_SAVED_QUERIES_DESCRIPTION,
  SEARCH_SCHEMA_DESCRIPTION,
  UNTRUSTED_DATA_NOTE,
} from '@tamery/shared/mcp'
import type { InferUITools } from 'ai'
import { tool } from 'ai'
import { type } from 'arktype'

const target = type({
  connectionId: type.string.describe(
    'Connection id from list_connections or a mention'
  ),
  resource: type('string | null').describe(
    "Resource (a database) of the connection; null for the connection's own database"
  ),
})

const statement = type({ '...': target, sql: 'string' })

const tableTarget = type({
  '...': target,
  schema: type.string.describe('Schema from list_tables'),
  table: 'string',
})

const opened = type({ opened: 'boolean' })

const asDatabaseData = ({ output }: { output: unknown }) => ({
  type: 'text' as const,
  value: `${UNTRUSTED_DATA_NOTE}\n${JSON.stringify(output)}`,
})

export const resultSetsType = type({
  affectedRows: 'number | null',
  columns: 'string[]',
  rows: 'unknown[][]',
  truncated: 'boolean',
}).array()

export const chatTools = {
  column_values: tool({
    description: COLUMN_VALUES_DESCRIPTION,
    inputSchema: type({
      '...': target,
      column: 'string',
      schema: type.string.describe('Schema from list_tables'),
      table: 'string',
    }),
    outputSchema: type.unknown,
    toModelOutput: asDatabaseData,
  }),
  combine: tool({
    description:
      "Run SQLite over result sets this chat already fetched, to join, compare or aggregate rows across connections or queries without matching them by hand. Each input loads one result (its query or execute call's toolCallId) as a table under the name you give it; then sql runs in SQLite's dialect over those tables. Values keep the types they came with; dates are text.",
    inputSchema: type({
      inputs: type({ name: 'string', toolCallId: 'string' }).array(),
      sql: 'string',
    }),
    outputSchema: resultSetsType,
    toModelOutput: asDatabaseData,
  }),
  create_share: tool({
    description:
      "Open the table's share dialog in Tamery for the user, showing the table as it is now (open it with open_table first to share a filtered view). The user picks the link's settings and saves it; nothing is shared until they do.",
    inputSchema: tableTarget,
    outputSchema: opened,
  }),
  describe_table: tool({
    description:
      'Describe one table or view: its columns (type, nullability, default, enum values), constraints (primary key, foreign keys with what they reference, unique, check) and indexes.',
    inputSchema: type({
      '...': target,
      schema: type.string.describe('Schema from list_tables'),
      table: 'string',
    }),
    outputSchema: type.unknown,
    toModelOutput: asDatabaseData,
  }),
  execute: tool({
    description: `Run one SQL statement that changes data or schema, in the connection's own dialect. Nothing runs until the user approves it in the chat; a declined statement comes back as an error, so never retry it unchanged. Wrap several statements in BEGIN … COMMIT to run them as one transaction, except on ClickHouse. Use query for reads. ${MCP_RESULT_LIMITS}`,
    inputSchema: statement,
    outputSchema: resultSetsType,
    toModelOutput: asDatabaseData,
  }),
  export_result: tool({
    description:
      'Download the rows of a query result already in this chat as a CSV or JSON file for the user. Name the result by the toolCallId of its query or execute call.',
    inputSchema: type({ format: "'csv' | 'json'", toolCallId: 'string' }),
    outputSchema: type({ exported: 'number' }),
  }),
  explain: tool({
    description: EXPLAIN_DESCRIPTION,
    inputSchema: type({ '...': statement, analyze: 'boolean' }),
    outputSchema: resultSetsType,
    toModelOutput: asDatabaseData,
  }),
  list_connections: tool({
    description:
      "List the user's database connections: id, name, engine and the resources (databases) opened in each.",
    inputSchema: type({}),
    outputSchema: type.unknown,
  }),
  list_tables: tool({
    description:
      'List the schemas of a connection with their tables and views. In MySQL and ClickHouse a schema is a database. Pass a schema to list only that one on a large database, or null for all.',
    inputSchema: type({ '...': target, schema: 'string | null' }),
    outputSchema: type.unknown,
    toModelOutput: asDatabaseData,
  }),
  open_query: tool({
    description:
      'Open SQL in a new Query tab in Tamery, for the user to read, change and run. It does not run it.',
    inputSchema: statement,
    outputSchema: opened,
  }),
  open_table: tool({
    description:
      "Open a table in Tamery with filters and a sort, so the user sees and edits its rows in the table view. Filters are ANDed; values are a list (one value for most operators, several for in and notIn, none for isNull and isNotNull). This replaces the table's current filters and sort.",
    inputSchema: type({
      '...': tableTarget,
      filters: type({
        column: 'string',
        operator: type.enumerated(...FILTER_OPERATORS),
        values: 'unknown[]',
      }).array(),
      orderBy: type({ column: 'string', direction: "'ASC' | 'DESC'" }).array(),
    }),
    outputSchema: opened,
  }),
  propose_change: tool({
    description: PROPOSE_CHANGE_DESCRIPTION,
    inputSchema: type({
      '...': target,
      change: agentChangeType,
      schema: type.string.describe('Schema from list_tables'),
      table: 'string',
    }),
    outputSchema: type({ review: 'string', where: "'table' | 'visualizer'" }),
  }),
  propose_note: tool({
    description:
      'Propose a note about the database for the user to keep: a fact its schema does not say, learned from the data or the user, e.g. "amounts are in cents" or "status 3 means refunded". It is about the whole database (schema and table null), a table (column null) or one column. Nothing is saved unless the user saves it, possibly edited; the output says whether they did and the text they kept. Never propose what the schema already says.',
    inputSchema: type({
      '...': target,
      column: 'string | null',
      note: 'string',
      schema: 'string | null',
      table: 'string | null',
    }),
    outputSchema: type({ note: 'string | null', saved: 'boolean' }),
  }),
  query: tool({
    description: `Run one read-only SQL statement in the connection's own dialect; statements that write are rejected. ${MCP_RESULT_LIMITS} The user sees the rows as a table under your call, so never repeat them in your answer.`,
    inputSchema: statement,
    outputSchema: resultSetsType,
    toModelOutput: asDatabaseData,
  }),
  search_saved_queries: tool({
    description: SEARCH_SAVED_QUERIES_DESCRIPTION,
    inputSchema: type({ '...': target, query: 'string' }),
    outputSchema: type.unknown,
  }),
  search_schema: tool({
    description: SEARCH_SCHEMA_DESCRIPTION,
    inputSchema: type({ '...': target, query: 'string' }),
    outputSchema: type.unknown,
    toModelOutput: asDatabaseData,
  }),
}

export type ChatTools = InferUITools<typeof chatTools>

// oxlint-disable-next-line typescript/consistent-type-definitions -- UIMessage needs an index-signature-compatible map, which an interface is not
export type ChatDataParts = {
  connection: typeof target.infer & { name: string; type: ConnectionType }
  table: typeof target.infer & {
    definition: unknown
    schema: string
    table: string
  }
}
