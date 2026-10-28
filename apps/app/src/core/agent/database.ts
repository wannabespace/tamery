import { getDialect } from '@tamery/shared/enums/connection-type'
import type { McpTarget } from '@tamery/shared/mcp'
import { MCP_MAX_ROWS } from '@tamery/shared/mcp'

import { getCollections } from '~/core/collections'
import { refreshAfterRun } from '~/core/connection/refresh-after-run'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import { statementQuery } from '~/core/queries/connection/statement'
import { transactionQuery } from '~/core/queries/connection/transaction'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { getQueryLanguage } from '~/core/runtime/language'
import {
  connectionResourceToQueryParams,
  connectionToQueryParams,
} from '~/core/runtime/query'

import { describeTable } from './describe-table'
import {
  fetchForAgent,
  getResources,
  resolveResource,
  resolveTarget,
} from './target'

type Statement = McpTarget & { sql: string }

const paramsOf = async (
  connection: Connection,
  resource: ConnectionResource | undefined
) => ({
  ...(await (resource
    ? connectionResourceToQueryParams(resource)
    : connectionToQueryParams(connection))),
  resultSets: { maxRows: MCP_MAX_ROWS },
})

/** What an agent (MCP or the chat) does to the user's databases. `prepare*` checks a statement and resolves its target without running anything, so a caller can count, approve or refuse it before `run`. */
export const agentDatabase = {
  connections: () =>
    getCollections().connectionsCollection.toArray.map(
      ({ id, label, name, type }) => ({
        id,
        label,
        name,
        resources: getResources(id),
        type,
      })
    ),
  describeTable,
  prepareRead: async ({ sql, ...target }: Statement) => {
    const { connection, resource } = resolveTarget(target)
    if (!getQueryLanguage(getDialect(connection.type)).readsOnly(sql)) {
      throw new Error(
        'Only one read-only statement (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, or a MongoDB find, aggregate, count or distinct) runs at a time.'
      )
    }
    const params = await paramsOf(connection, resource)
    return {
      connection,
      run: (signal: AbortSignal) =>
        transactionQuery({
          accessMode: 'read only',
          commit: false,
          statements: [sql],
        }).run({ ...params, signal }),
    }
  },
  prepareWrite: async ({ sql, ...target }: Statement) => {
    const { connection, resource } = resolveTarget(target)
    const dialect = getDialect(connection.type)
    if (getQueryLanguage(dialect).split(sql).length !== 1) {
      throw new Error(
        'Run one statement at a time, or wrap several in BEGIN … COMMIT to run them together (on Oracle, in one BEGIN … END; block; not on ClickHouse, which has no transactions).'
      )
    }
    const params = await paramsOf(connection, resource)
    return {
      connection,
      params,
      resource,
      run: async (signal: AbortSignal) => {
        const sets = await statementQuery(sql, dialect).run({
          ...params,
          signal,
        })
        if (resource) {
          refreshAfterRun(resource, dialect, sql)
        }
        return sets
      },
    }
  },
  tables: async ({ schema, ...target }: McpTarget & { schema?: string }) => {
    const { connection, resource } = resolveResource(target)
    const { schemas } = await fetchForAgent(
      resourceTablesAndSchemasQueryOptions({ connectionResource: resource })
    )
    if (!schema) {
      return { connection, schemas }
    }
    const match = schemas.filter(({ name }) => name === schema)
    if (match.length === 0) {
      throw new Error(
        `No schema "${schema}". Call list_tables without schema for the schemas.`
      )
    }
    return { connection, schemas: match }
  },
}
