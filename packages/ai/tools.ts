import type { ConnectionType } from '@tamery/shared/enums/connection-type'
import {
  COLUMN_VALUES_DESCRIPTION,
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
