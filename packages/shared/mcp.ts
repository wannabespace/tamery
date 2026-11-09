import type { ConnectionType } from './enums/connection-type'

export const MCP_MAX_ROWS = 200

export type McpAccess = 'off' | 'read' | 'ask' | 'write'

export const DEFAULT_MCP_ACCESS: McpAccess = 'ask'

interface McpConnection {
  id: string
  label: string | null
  name: string
  type: ConnectionType
  resources: string[]
}

export interface McpTarget {
  connectionId: string
  resource?: string
}

/** An `AbortSignal` cannot cross the context bridge. */
type OnAbort = (listener: () => void) => void

/** Main checks each connection's access before asking, so the window runs whatever it is asked. Every method takes `(args, onAbort)` so the bridge dispatches by name. */
export interface McpSource {
  connections: (args: undefined, onAbort: OnAbort) => McpConnection[]
  describeTable: (
    args: McpTarget & { schema: string; table: string },
    onAbort: OnAbort
  ) => Promise<unknown>
  execute: (
    args: McpTarget & { sql: string; approve: boolean },
    onAbort: OnAbort
  ) => Promise<unknown>
  query: (
    args: McpTarget & { sql: string },
    onAbort: OnAbort
  ) => Promise<unknown>
  tables: (
    args: McpTarget & { schema?: string },
    onAbort: OnAbort
  ) => Promise<unknown>
}

export type McpRequest = {
  [K in keyof McpSource]: { method: K; args: Parameters<McpSource[K]>[0] }
}[keyof McpSource]

export type McpReply = { result: unknown } | { error: string } | { idle: true }

export type McpTool =
  | 'list_connections'
  /** No longer a tool, but up to 100 logged calls stay in the activity log and still render. */
  | 'create_connection'
  | 'list_tables'
  | 'describe_table'
  | 'query'
  | 'execute'

export interface McpCall {
  at: number
  client: string
  connectionId: string | null
  /** The schema or the table; never a connection string. */
  detail: string | null
  error: string | null
  id: string
  query: string | null
  resource: string | null
  tool: McpTool
}

export interface McpClient {
  lastSeenAt: number
  name: string
  version: string
}

export type McpStatus =
  | { state: 'off' }
  | { state: 'failed'; error: string }
  | { state: 'running'; token: string; url: string }
