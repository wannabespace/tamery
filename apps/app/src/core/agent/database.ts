import { getDialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import { MCP_MAX_ROWS } from '@tamery/shared/mcp'
import { toToolOutput } from '@tamery/shared/tool-output'
import { dialects, splitStatements } from '@tamery/sql'
import { Result } from 'better-result'

import { getCollections } from '~/core/collections'
import { refreshAfterRun } from '~/core/connection/refresh-after-run'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import { estimateQuery } from '~/core/queries/connection/estimate'
import { explainQuery } from '~/core/queries/connection/explain'
import { statementQuery } from '~/core/queries/connection/statement'
import { transactionQuery } from '~/core/queries/connection/transaction'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { getQueryLanguage } from '~/core/runtime/language'
import {
  connectionResourceToQueryParams,
  connectionToQueryParams,
} from '~/core/runtime/query'
import { workspaceSelection } from '~/core/workspace/utils'

import { columnValues } from './column-values'
import { describeTable } from './describe-table'
import { proposeChange } from './propose-change'
import { searchSavedQueries } from './saved-queries'
import { searchSchema } from './search-schema'
import type { AgentTarget } from './target'
import {
  fetchForAgent,
  getResources,
  resolveResource,
  resolveTarget,
} from './target'

type Statement = AgentTarget & { statement: string }

/** What a statement does, read from its text, never from what the agent says it does: approvals, policies and the audit log go by it. */
export type OperationKind = 'destructive' | 'read' | 'write'

const ESTIMATE_BUDGET_MS = 3000

const EXPLAINED_COMMANDS = new Set([
  'DELETE',
  'INSERT',
  'MERGE',
  'REPLACE',
  'SELECT',
  'TABLE',
  'UPDATE',
  'VALUES',
  'WITH',
])

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
  columnValues,
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
  prepareRead: async ({ statement: sql, ...target }: Statement) => {
    const { connection, resource } = resolveTarget(target)
    if (!getQueryLanguage(getDialect(connection.type)).readsOnly(sql)) {
      throw new Error(
        'Only one read-only statement (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, or a MongoDB find, aggregate, count or distinct) runs at a time.'
      )
    }
    const params = await getQueryParams(connection, resource)
    return {
      connection,
      kind: 'read' as OperationKind,
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
  prepareWrite: async ({ statement: sql, ...target }: Statement) => {
    const { connection, resource } = resolveTarget(target)
    const dialect = getDialect(connection.type)
    if (getQueryLanguage(dialect).split(sql).length !== 1) {
      throw new Error(
        'Run one statement at a time, or wrap several in BEGIN … COMMIT to run them together (on Oracle, in one BEGIN … END; block; not on ClickHouse, which has no transactions).'
      )
    }
    const params = await getQueryParams(connection, resource)
    const estimator = estimateQuery(sql, dialect)
    const language = getQueryLanguage(dialect)
    let kind: OperationKind = language.readsOnly(sql) ? 'read' : 'write'
    if (language.destructive(sql).length > 0) {
      kind = 'destructive'
    }
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
      kind,
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
  proposeChange,
  searchSavedQueries,
  searchSchema,
  /** The plan of one statement. Only a read may be analyzed, since that runs it; the text must open with a data verb, so nothing it holds can turn the EXPLAIN into something else. */
  explain: async ({
    analyze,
    statement: sql,
    ...target
  }: Statement & { analyze: boolean }) => {
    const { connection, resource } = resolveTarget(target)
    const dialect = getDialect(connection.type)
    const [statement, ...rest] = isSqlDialect(dialect)
      ? splitStatements(sql, dialects[dialect])
      : []
    if (
      !statement ||
      rest.length > 0 ||
      !EXPLAINED_COMMANDS.has(statement.tokens[0]?.text.toUpperCase() ?? '')
    ) {
      throw new Error(
        'Explain one SQL statement that starts with SELECT, WITH, INSERT, UPDATE, DELETE or MERGE.'
      )
    }
    if (analyze && !getQueryLanguage(dialect).readsOnly(sql)) {
      throw new Error(
        'analyze runs the statement, so only a read takes it. Explain this one without analyze.'
      )
    }
    const params = await getQueryParams(connection, resource)
    return toToolOutput(
      await explainQuery({ analyze, statement: sql }).run(params)
    )
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
