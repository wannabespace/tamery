import { getDialect } from '@tamery/shared/enums/connection-type'
import { MCP_MAX_ROWS } from '@tamery/shared/mcp'
import { toToolOutput } from '@tamery/shared/tool-output'
import { Result } from 'better-result'

import { getCollections } from '~/core/collections'
import { refreshAfterRun } from '~/core/connection/refresh-after-run'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import { estimateQuery } from '~/core/queries/connection/estimate'
import { statementQuery } from '~/core/queries/connection/statement'
import { transactionQuery } from '~/core/queries/connection/transaction'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { getQueryLanguage } from '~/core/runtime/language'
import {
  connectionResourceToQueryParams,
  connectionToQueryParams,
} from '~/core/runtime/query'
import { workspaceSelection } from '~/core/workspace/utils'

import { describeTable } from './describe-table'
import type { AgentTarget } from './target'
import {
  fetchForAgent,
  getResources,
  resolveResource,
  resolveTarget,
} from './target'

type Statement = AgentTarget & { sql: string }

const ESTIMATE_BUDGET_MS = 3000

const getQueryParams = async (
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
  /** The chat sees the active workspace's connections; MCP sees every one and gates them by its own access. */
  connections: (scope: 'active-workspace' | 'all') => {
    const { connectionsCollection, workspacesCollection } = getCollections()
    const workspace = workspaceSelection.current(workspacesCollection.toArray)
    return connectionsCollection.toArray
      .filter(
        (connection) =>
          scope === 'all' || connection.workspaceId === workspace?.id
      )
      .map(({ id, label, name, type }) => ({
        id,
        label,
        name,
        resources: getResources(id),
        type,
      }))
  },
  describeTable,
  prepareRead: async ({ sql, ...target }: Statement) => {
    const { connection, resource } = resolveTarget(target)
    if (!getQueryLanguage(getDialect(connection.type)).readsOnly(sql)) {
      throw new Error(
        'Only one read-only statement (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, or a MongoDB find, aggregate, count or distinct) runs at a time.'
      )
    }
    const params = await getQueryParams(connection, resource)
    return {
      connection,
      run: async (signal: AbortSignal) =>
        toToolOutput(
          await transactionQuery({
            accessMode: 'read only',
            commit: false,
            statements: [sql],
          }).run({ ...params, signal })
        ),
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
    const params = await getQueryParams(connection, resource)
    const estimator = estimateQuery(sql, dialect)
    return {
      connection,
      /** Rows the planner expects the statement to change, or null when the engine or statement has none or the planner is slow. The pool holds one connection, so settle it before `run`. */
      estimate: async (signal: AbortSignal) => {
        const rows = await Result.tryPromise(
          async () =>
            (await estimator?.run({
              ...params,
              signal: AbortSignal.any([
                signal,
                AbortSignal.timeout(ESTIMATE_BUDGET_MS),
              ]),
            })) ?? null
        )
        return rows.unwrapOr(null)
      },
      resource,
      run: async (signal: AbortSignal) => {
        const sets = await statementQuery(sql, dialect).run({
          ...params,
          signal,
        })
        if (resource) {
          refreshAfterRun(resource, dialect, sql)
        }
        return toToolOutput(sets)
      },
    }
  },
  tables: async ({
    schema,
    ...target
  }: AgentTarget & { schema?: string | null }) => {
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
