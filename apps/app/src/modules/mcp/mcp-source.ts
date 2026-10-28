import { connectionParts } from '@tamery/connection/connection-parts'
import { GUEST_CONNECTIONS_MESSAGE } from '@tamery/shared/constants'
import type { ConnectionType } from '@tamery/shared/enums/connection-type'
import { getDialect } from '@tamery/shared/enums/connection-type'
import type { McpAccess, McpSource } from '@tamery/shared/mcp'
import { Result } from 'better-result'

import { agentDatabase } from '~/core/agent/database'
import { getResources, resolveResource } from '~/core/agent/target'
import { getCollections } from '~/core/collections'
import { createConnection } from '~/core/connection/save'
import type { ResultSet } from '~/core/queries/connection/custom'
import { testConnectionQuery } from '~/core/queries/connection/test'
import { permix } from '~/core/user/permissions'
import { workspaceSelection } from '~/core/workspace/utils'
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
  createConnection: async ({
    connectionString: given,
    name,
    syncType,
    type,
  }) => {
    const { connectionsCollection, workspacesCollection } = getCollections()
    if (
      !permix.check('connection.create', {
        count: connectionsCollection.size,
      })
    ) {
      throw new Error(GUEST_CONNECTIONS_MESSAGE)
    }
    const workspace = workspaceSelection.current(workspacesCollection.toArray)
    if (!workspace) {
      throw new Error('Tamery is still loading. Try again in a moment.')
    }
    const parts = { ...connectionParts.parse(given), type }
    const connectionString = connectionParts.format(parts)
    await testConnectionQuery.run({
      connectionString,
      dialect: getDialect(type),
    })
    const { id } = await createConnection({
      connectionString,
      name,
      provider: connectionParts.parse(connectionString).provider,
      syncType,
      type,
      workspaceId: workspace.id,
    })
    posthog.capture('mcp_connection_created', {
      connection_type: type,
      sync_type: syncType,
    })
    notifications.notify({
      body: name,
      title: 'An agent created a connection',
    })
    return { id, label: null, name, resources: getResources(id), type }
  },
  describeTable: (args) => {
    posthog.capture('mcp_table_described', {
      connection_type: resolveResource(args).connection.type,
    })
    return agentDatabase.describeTable(args)
  },
  execute: async ({ approve, ...statement }, onAbort) => {
    const { connection, estimate, resource, run } =
      await agentDatabase.prepareWrite(statement)
    await assertQuota()
    const signal = getAbortSignal(onAbort)
    if (approve) {
      await approval.request({
        connection,
        estimate,
        resourceName: resource?.name ?? null,
        signal,
        sql: statement.sql,
      })
    }
    const sets = await runForAgent(run(signal), {
      access: approve ? 'ask' : 'write',
      connection_type: connection.type,
    })
    if (!approve) {
      notifications.notify({
        body: statement.sql,
        title: `An agent changed ${connection.name}`,
      })
    }
    return sets
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
