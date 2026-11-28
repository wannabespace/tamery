import { getCollections } from '~/core/collections'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import { findEnum, resourceEnumsQueryOptions } from '~/core/queries/enums/list'
import { resourceIndexesQueryOptions } from '~/core/queries/indexes/list'
import { resourceTableColumnsQueryOptions } from '~/core/queries/tables/columns'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'

import type { AgentTarget } from './target'
import { fetchForAgent, resolveResource } from './target'

export const describeTable = async ({
  schema,
  table,
  ...target
}: AgentTarget & { schema: string; table: string }) => {
  const { resource: connectionResource } = resolveResource(target)
  const inTable = (row: { schema: string; table: string }) =>
    row.schema === schema && row.table === table
  const [columns, constraints, indexes, enums, catalog] = await Promise.all([
    fetchForAgent(
      resourceTableColumnsQueryOptions({
        connectionResource,
        schema,
        table,
      })
    ),
    fetchForAgent(resourceConstraintsQueryOptions({ connectionResource })),
    fetchForAgent(resourceIndexesQueryOptions({ connectionResource })),
    fetchForAgent(resourceEnumsQueryOptions({ connectionResource })),
    fetchForAgent(resourceTablesAndSchemasQueryOptions({ connectionResource })),
  ])
  if (columns.length === 0) {
    throw new Error(
      `No table "${schema}"."${table}". Call list_tables for its tables.`
    )
  }

  return {
    columns: columns.map((column) => ({
      comment: column.comment ?? undefined,
      default: column.default,
      enumValues: findEnum({ column, enums, table })?.values,
      generated: column.isGenerated || undefined,
      identity: column.isIdentity || undefined,
      name: column.id,
      nullable: column.isNullable,
      type: column.declaredType ?? column.typeLabel,
    })),
    comment:
      catalog.schemas
        .find((item) => item.name === schema)
        ?.tables.find((item) => item.name === table)?.comment ?? undefined,
    constraints: [
      ...Map.groupBy(constraints.filter(inTable), (row) => row.name),
    ].map(([name, group]) => {
      const [first] = group
      return {
        check: first?.expression ?? undefined,
        columns: group.flatMap((row) => row.column ?? []),
        name,
        onDelete: first?.onDelete ?? undefined,
        onUpdate: first?.onUpdate ?? undefined,
        references: first?.foreignTable
          ? {
              columns: group.flatMap((row) => row.foreignColumn ?? []),
              schema: first.foreignSchema,
              table: first.foreignTable,
            }
          : undefined,
        type: first?.type,
      }
    }),
    notes: getCollections().schemaNotesCollection.toArray.flatMap((note) =>
      note.connectionResourceId === connectionResource.id &&
      note.schema === schema &&
      note.table === table
        ? [{ column: note.column, note: note.note }]
        : []
    ),
    indexes: [...Map.groupBy(indexes.filter(inTable), (row) => row.name)].map(
      ([name, group]) => {
        const [first] = group
        return {
          columns: group.flatMap((row) => row.column ?? []),
          definition: first?.definition,
          name,
          primary: first?.isPrimary,
          type: first?.type,
          unique: first?.isUnique,
        }
      }
    ),
  }
}
