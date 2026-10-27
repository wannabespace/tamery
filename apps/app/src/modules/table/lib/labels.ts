import { IN_FILTER } from '@tamery/shared/filters'
import type { GridRow } from '@tamery/table'
import { useQueries } from '@tanstack/react-query'

import { useConnectionContext } from '~/core/connection/route'
import type { ConnectionResource } from '~/core/connection/sync'
import { DEFAULT_PAGE_LIMIT } from '~/core/connection/utils'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import type { RowsQueryProps } from '~/core/queries/rows/list'
import {
  resourceRowsQuery,
  resourceRowsQueryKey,
} from '~/core/queries/rows/list'
import { resourceTableColumnsQueryOptions } from '~/core/queries/tables/columns'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import type { Column } from '~/core/table/cell/utils'
import {
  labelCandidates,
  useReferencedColumns,
} from '~/core/table/referenced-columns'
import { getDisplayValue } from '~/core/transformers/value-transformer'
import { queryClient } from '~/lib/query-client'

const keysIn = (rows: GridRow[], column: string) =>
  [
    ...new Set(
      rows.flatMap((row) => {
        const value = row[column]
        return value === null || value === undefined ? [] : [String(value)]
      })
    ),
  ].toSorted()

const byColumn = (
  results: { data?: readonly [string, Map<string, string>] }[]
) => {
  const merged = new Map<string, Map<string, string>>()
  for (const { data } of results) {
    if (data) {
      const [id, labels] = data
      merged.set(id, new Map([...(merged.get(id) ?? []), ...labels]))
    }
  }
  return merged
}

// Chunked like the grid's pages, so a newly loaded page fetches only its own labels and the loaded ones stay cached.
const rowChunks = (rows: GridRow[]) =>
  Array.from(
    { length: Math.ceil(rows.length / DEFAULT_PAGE_LIMIT) },
    (_, index) =>
      rows.slice(index * DEFAULT_PAGE_LIMIT, (index + 1) * DEFAULT_PAGE_LIMIT)
  )

const LABEL_CHARS = 60
const LABEL_NAMES_BY_PREFERENCE = [
  'name',
  'title',
  'label',
  'displayname',
  'fullname',
  'username',
  'nickname',
  'login',
  'handle',
  'email',
  'firstname',
  'lastname',
  'subject',
  'heading',
  'caption',
  'slug',
  'code',
  'sku',
  'role',
  'description',
]

const comparable = (column: string) =>
  column.toLowerCase().replaceAll(/[\s_-]/gu, '')

const defaultLabel = (columns: { id: string; type: string }[], key: string) => {
  const candidates = labelCandidates(columns, key)
  return LABEL_NAMES_BY_PREFERENCE.map((name) =>
    candidates.find((column) => comparable(column.id) === name)
  ).find(Boolean)?.id
}

export const getLabelColumn = (
  stored: string | undefined,
  columns: { id: string; type: string }[],
  key: string
) => (stored === undefined ? defaultLabel(columns, key) : stored || undefined)

const referenceLabelsQueryOptions = ({
  connectionResource,
  foreign,
  id,
  keys,
  label,
  referenced,
}: {
  connectionResource: ConnectionResource
  foreign: Pick<NonNullable<Column['foreign']>, 'column' | 'schema' | 'table'>
  id: string
  keys: string[]
  label: string
  referenced: RowsQueryProps['columns']
}) => ({
  queryFn: async () => {
    const found = await resourceRowsQuery({
      columns: referenced,
      limit: keys.length,
      offset: 0,
      query: {
        filters: [{ column: foreign.column, ref: IN_FILTER, values: keys }],
      },
      schema: foreign.schema,
      select: [foreign.column, label],
      table: foreign.table,
    }).run(await connectionResourceToQueryParams(connectionResource))
    return [
      id,
      new Map(
        found.flatMap((row) => {
          const text = row[label]
          return text === null || text === undefined || text === ''
            ? []
            : [
                [
                  String(row[foreign.column]),
                  getDisplayValue(text, LABEL_CHARS),
                ] as const,
              ]
        })
      ),
    ] as const
  },
  queryKey: [
    ...resourceRowsQueryKey({
      connectionResource,
      schema: foreign.schema,
      table: foreign.table,
    }),
    'labels',
    id,
    foreign.column,
    label,
    keys,
  ],
})

export const useReferenceLabels = (
  columns: Column[],
  rows: GridRow[],
  stored: Record<string, string>
) => {
  const { connectionResource } = useConnectionContext()
  const referenced = useReferencedColumns(columns)
  const labeled = columns.flatMap(({ foreign, id }) => {
    if (!foreign) {
      return []
    }
    const label = getLabelColumn(
      stored[id],
      referenced.get(id) ?? [],
      foreign.column
    )
    return label ? [{ foreign, id, label }] : []
  })

  return useQueries({
    combine: byColumn,
    queries: labeled.flatMap(({ foreign, id, label }) =>
      rowChunks(rows).flatMap((chunk) => {
        const keys = keysIn(chunk, id)
        return keys.length > 0
          ? [
              referenceLabelsQueryOptions({
                connectionResource,
                foreign,
                id,
                keys,
                label,
                referenced: referenced.get(id),
              }),
            ]
          : []
      })
    ),
  })
}

export const prefetchReferenceLabels = async ({
  connectionResource,
  hidden,
  rows,
  schema,
  stored,
  table,
}: {
  connectionResource: ConnectionResource
  hidden: string[]
  rows: GridRow[]
  schema: string
  stored: Record<string, string>
  table: string
}) => {
  const constraints = await queryClient.query(
    resourceConstraintsQueryOptions({ connectionResource })
  )
  const foreignKeys = constraints.flatMap((constraint) => {
    const { column, foreignColumn, foreignSchema, foreignTable } = constraint
    return constraint.type === 'foreignKey' &&
      constraint.schema === schema &&
      constraint.table === table &&
      column &&
      !hidden.includes(column) &&
      foreignColumn &&
      foreignSchema &&
      foreignTable
      ? [
          {
            foreign: {
              column: foreignColumn,
              schema: foreignSchema,
              table: foreignTable,
            },
            id: column,
          },
        ]
      : []
  })

  await Promise.all(
    foreignKeys.map(async ({ foreign, id }) => {
      const keys = keysIn(rows, id)
      if (keys.length === 0) {
        return
      }
      const referenced = await queryClient.query(
        resourceTableColumnsQueryOptions({
          connectionResource,
          schema: foreign.schema,
          table: foreign.table,
        })
      )
      const label = getLabelColumn(stored[id], referenced, foreign.column)
      if (label) {
        await queryClient.query(
          referenceLabelsQueryOptions({
            connectionResource,
            foreign,
            id,
            keys,
            label,
            referenced,
          })
        )
      }
    })
  )
}
