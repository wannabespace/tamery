import type { ConnectionType } from '@tamery/shared/enums/connection-type'
import type { McpAccess, McpSource } from '@tamery/shared/mcp'
import { Result } from 'better-result'

import { agentDatabase } from '~/core/agent/database'
import { resolveResource, resolveTarget } from '~/core/agent/target'
import type { ResultSet } from '~/core/queries/connection/custom'
import { notifications } from '~/lib/notifications'
import { posthog } from '~/lib/posthog'

import { approval } from './approval'
import { assertQuota, recordQuery } from './usage'

const getAbortSignal = (onAbort: (listener: () => void) => void) => {
  const controller = new AbortController()
  onAbort(() => controller.abort())
  return controller.signal
}

const runForAgent = async (
  run: Promise<ResultSet[]>,
  event: { access: McpAccess; connection_type: ConnectionType }
) => {
  const result = await Result.tryPromise(() => run)
  posthog.capture('mcp_query_run', { ...event, success: result.isOk() })
  if (result.isErr()) {
    throw result.error.cause
  }
  void recordQuery()
  return result.value
}

export const mcpSource: McpSource = {
  columnValues: (args) => {
    posthog.capture('mcp_column_values_read', {
      connection_type: resolveResource(args).connection.type,
    })
    return agentDatabase.columnValues(args)
  },
  connections: () => agentDatabase.connections('all'),
  describeTable: (args) => {
    posthog.capture('mcp_table_described', {
      connection_type: resolveResource(args).connection.type,
    })
    return agentDatabase.describeTable(args)
  },
  explain: (args) => {
    posthog.capture('mcp_plan_explained', {
      analyze: args.analyze,
      connection_type: resolveTarget(args).connection.type,
    })
    return agentDatabase.explain(args)
  },
  execute: async ({ approve, ...statement }, onAbort) => {
    const { connection, estimate, kind, resource, run } =
      await agentDatabase.prepareWrite(statement)
    await assertQuota()
    const signal = getAbortSignal(onAbort)
    if (approve) {
      await approval.request({
        connection,
        estimate,
        kind,
        resourceName: resource?.name ?? null,
        signal,
        sql: statement.statement,
      })
    }
    const sets = await runForAgent(run(signal), {
      access: approve ? 'ask' : 'write',
      connection_type: connection.type,
    })
    if (!approve) {
      notifications.notify({
        body: statement.statement,
        title: `An agent changed ${connection.name}`,
      })
    }
    return sets
  },
  proposeChange: async (args) => {
    const proposed = await agentDatabase.proposeChange(args)
    posthog.capture('mcp_change_proposed', {
      connection_type: resolveResource(args).connection.type,
      kind: args.change.kind,
    })
    notifications.notify({
      body: proposed.review,
      title: 'An agent drafted a change for you to review',
    })
    return proposed
  },
  query: async (statement, onAbort) => {
    const { connection, run } = await agentDatabase.prepareRead(statement)
    await assertQuota()
    return runForAgent(run(getAbortSignal(onAbort)), {
      access: 'read',
      connection_type: connection.type,
    })
  },
  searchSavedQueries: (args) => {
    posthog.capture('mcp_saved_queries_searched', {
      connection_type: resolveResource(args).connection.type,
    })
    return agentDatabase.searchSavedQueries(args)
  },
  searchSchema: (args) => {
    posthog.capture('mcp_schema_searched', {
      connection_type: resolveResource(args).connection.type,
    })
    return agentDatabase.searchSchema(args)
  },
  tables: async (args) => {
    const { connection, schemas } = await agentDatabase.tables(args)
    posthog.capture('mcp_tables_listed', {
      connection_type: connection.type,
      filtered: !!args.schema,
    })
    return { schemas }
  },
}
