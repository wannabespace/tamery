import { connectionParts } from '@tamery/connection/connection-parts'
import { GUEST_CONNECTIONS_MESSAGE } from '@tamery/shared/constants'
import type { ConnectionType } from '@tamery/shared/enums/connection-type'
import { getDialect } from '@tamery/shared/enums/connection-type'
import type { McpAccess, McpSource } from '@tamery/shared/mcp'
import { MCP_MAX_ROWS } from '@tamery/shared/mcp'
import { Result } from 'better-result'

import { getCollections } from '~/core/collections'
import { refreshAfterRun } from '~/core/connection/refresh-after-run'
import { createConnection } from '~/core/connection/save'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import type { ResultSet } from '~/core/queries/connection/custom'
import { statementQuery } from '~/core/queries/connection/statement'
import { testConnectionQuery } from '~/core/queries/connection/test'
import { transactionQuery } from '~/core/queries/connection/transaction'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { getQueryLanguage } from '~/core/runtime/language'
import {
  connectionResourceToQueryParams,
  connectionToQueryParams,
} from '~/core/runtime/query'
import { permix } from '~/core/user/permissions'
import { workspaceSelection } from '~/core/workspace/utils'
import { notifications } from '~/lib/notifications'
import { posthog } from '~/lib/posthog'

import { approval } from './approval'
import { describeTable } from './describe-table'
import {
  getResources,
  fetchForAgent,
  resolveResource,
  resolveTarget,
} from './target'
import { assertQuota, recordQuery } from './usage'

const agentParams = async (
  connection: Connection,
  resource: ConnectionResource | undefined
) => ({
  ...(await (resource
    ? connectionResourceToQueryParams(resource)
    : connectionToQueryParams(connection))),
  resultSets: { maxRows: MCP_MAX_ROWS },
})

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

const toMcpConnection = ({
  id,
  label,
  name,
  type,
}: Pick<Connection, 'id' | 'label' | 'name' | 'type'>) => ({
  id,
  label,
  name,
  resources: getResources(id),
  type,
})

export const mcpSource: McpSource = {
  connections: () =>
    getCollections().connectionsCollection.toArray.map(toMcpConnection),
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
    const workspace = workspaceSelection.target(workspacesCollection.toArray)
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
    return toMcpConnection({ id, label: null, name, type })
  },
  describeTable,
  execute: async ({ approve, sql, ...target }, onAbort) => {
    const { connection, resource } = resolveTarget(target)
    const dialect = getDialect(connection.type)
    if (getQueryLanguage(dialect).split(sql).length !== 1) {
      throw new Error(
        'Run one statement at a time, or wrap several in BEGIN … COMMIT to run them together (on Oracle, in one BEGIN … END; block; not on ClickHouse, which has no transactions).'
      )
    }
    await assertQuota()
    const params = await agentParams(connection, resource)
    const signal = getAbortSignal(onAbort)
    if (approve) {
      await approval.request({
        connection,
        params,
        resourceName: resource?.name ?? null,
        signal,
        sql,
      })
    }
    const sets = await runForAgent(
      statementQuery(sql, dialect).run({ ...params, signal }),
      { access: approve ? 'ask' : 'write', connection_type: connection.type }
    )
    if (resource) {
      refreshAfterRun(resource, dialect, sql)
    }
    if (!approve) {
      notifications.notify({
        body: sql,
        title: `An agent changed ${connection.name}`,
      })
    }
    return sets
  },
  query: async ({ sql, ...target }, onAbort) => {
    const { connection, resource } = resolveTarget(target)
    if (!getQueryLanguage(getDialect(connection.type)).readsOnly(sql)) {
      throw new Error(
        'Only one read-only statement (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, or a MongoDB find, aggregate, count or distinct) runs at a time.'
      )
    }
    await assertQuota()
    const signal = getAbortSignal(onAbort)
    return runForAgent(
      transactionQuery({
        accessMode: 'read only',
        commit: false,
        statements: [sql],
      }).run({ ...(await agentParams(connection, resource)), signal }),
      { access: 'read', connection_type: connection.type }
    )
  },
  tables: async ({ schema, ...target }) => {
    const { connection, resource } = resolveResource(target)
    const { schemas } = await fetchForAgent(
      resourceTablesAndSchemasQueryOptions({ connectionResource: resource })
    )
    posthog.capture('mcp_tables_listed', {
      connection_type: connection.type,
      filtered: !!schema,
    })
    if (!schema) {
      return { schemas }
    }
    const match = schemas.filter(({ name }) => name === schema)
    if (match.length === 0) {
      throw new Error(
        `No schema "${schema}". Call list_tables without schema for the schemas.`
      )
    }
    return { schemas: match }
  },
}
