import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import type { QuerySource, TableRef } from '@tamery/monaco/query-language'
import {
  attachGhostTextEscape,
  attachSqlDiagnostics,
  bindQueryModel,
  EMPTY_CATALOG,
} from '@tamery/monaco/query-language'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import type {
  ConnectionType,
  Dialect,
} from '@tamery/shared/enums/connection-type'
import { noop } from '@tamery/shared/utils'
import type { SqlCatalog } from '@tamery/sql'
import { dialects, findTableWithSchema } from '@tamery/sql'
import { matchQuery } from '@tanstack/react-query'
import type { editor } from 'monaco-editor'

import type { ConnectionResource } from '~/core/connection/sync'
import { resourceEnumsQueryOptions } from '~/core/queries/enums/list'
import { resourceTableColumnsQueryOptions } from '~/core/queries/tables/columns'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { schemaNotes } from '~/core/schema-notes/notes'
import { permix } from '~/core/user/permissions'
import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'
import { appStore } from '~/store'

const getSqlCatalog = (
  connectionResource: ConnectionResource,
  dialect: Dialect
): SqlCatalog => {
  const tables = queryClient.getQueryData(
    resourceTablesAndSchemasQueryOptions({ connectionResource }).queryKey
  )
  const enums = queryClient.getQueryData(
    resourceEnumsQueryOptions({ connectionResource }).queryKey
  )
  if (!tables) {
    return EMPTY_CATALOG
  }
  return {
    defaultSchema: tables.defaultSchema,
    enums: (enums ?? []).map(({ metadata, name, values }) => ({
      column: metadata?.column,
      name,
      table: metadata?.table,
      values,
    })),
    nameCase: isSqlDialect(dialect) ? dialects[dialect].nameCase : null,
    schemas: tables.schemas.map((schema) => ({
      name: schema.name,
      tables: schema.tables.map((table) => ({
        columns:
          queryClient
            .getQueryData(
              resourceTableColumnsQueryOptions({
                connectionResource,
                schema: schema.name,
                table: table.name,
              }).queryKey
            )
            ?.map((column) => ({
              comment: column.comment,
              name: column.id,
              nullable: column.isNullable,
              // Postgres reports enum columns as `USER-DEFINED`; the label names the enum.
              type: column.typeLabel,
            })) ?? null,
        comment: table.comment,
        kind: table.type,
        name: table.name,
      })),
    })),
  }
}

const querySourceFor = (
  connectionResource: ConnectionResource,
  connectionType: ConnectionType,
  dialect: Dialect
): QuerySource => {
  const catalog = () => getSqlCatalog(connectionResource, dialect)
  const tablesOptions = resourceTablesAndSchemasQueryOptions({
    connectionResource,
  })
  const enumsOptions = resourceEnumsQueryOptions({ connectionResource })
  const uncachedColumns = (refs: TableRef[]) => {
    const current = catalog()
    return refs.flatMap((ref) => {
      const found = findTableWithSchema(current, ref.name, ref.schema)
      return found?.table.columns === null
        ? [
            resourceTableColumnsQueryOptions({
              connectionResource,
              schema: found.schema,
              table: found.table.name,
            }),
          ]
        : []
    })
  }
  const loadMissing = async (refs: TableRef[]) => {
    await Promise.all([
      queryClient.query({ ...tablesOptions, staleTime: 'static' }),
      queryClient.query({ ...enumsOptions, staleTime: 'static' }),
    ])
    await Promise.all(
      uncachedColumns(refs).map((options) =>
        queryClient.query({ ...options, staleTime: 'static' })
      )
    )
  }
  return {
    catalog,
    complete: (input, signal) =>
      orpc.ai.completeQuery.call(
        {
          ...input,
          context: schemaNotes
            .inContext(input.context, connectionResource.id)
            .slice(0, AI_QUERY_LIMITS.context),
          type: connectionType,
        },
        { context: { silent: true }, signal }
      ),
    dialect,
    ghostTextEnabled: () =>
      appStore.get().isOnline && permix.check('ai.query.complete'),
    load: (refs) =>
      [tablesOptions, enumsOptions].every(
        (options) => queryClient.getQueryData(options.queryKey) !== undefined
      ) && uncachedColumns(refs).length === 0
        ? undefined
        : loadMissing(refs),
    onCatalogChange: (listener) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === 'updated' &&
          matchQuery(
            { queryKey: ['connection-resource', connectionResource.id] },
            event.query
          )
        ) {
          listener()
        }
      }),
  }
}

export const attachQuerySource = (
  codeEditor: editor.IStandaloneCodeEditor,
  connectionResource: ConnectionResource,
  connectionType: ConnectionType,
  dialect: Dialect,
  // A routine body is not a top-level statement, so SQL diagnostics would flag valid PL/pgSQL; completion and ghost text still help.
  { diagnostics = true }: { diagnostics?: boolean } = {}
) => {
  const source = querySourceFor(connectionResource, connectionType, dialect)
  const model = codeEditor.getModel()
  if (model) {
    bindQueryModel(model, source)
  }
  const detachDiagnostics = diagnostics
    ? attachSqlDiagnostics(codeEditor, source)
    : noop
  const detachEscape = attachGhostTextEscape(codeEditor)
  return () => {
    detachDiagnostics()
    detachEscape()
  }
}
