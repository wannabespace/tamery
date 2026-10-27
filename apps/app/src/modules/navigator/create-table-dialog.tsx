import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { createRef, useImperativeHandle, useState } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { engineName } from '~/core/catalog/engine-name'
import { useConnectionContext } from '~/core/connection/route'
import { createTableQuery } from '~/core/queries/tables/create'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import type { TableDialogRequest } from '~/core/table/table-dialog'
import { TableDialog } from '~/core/table/table-dialog'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'

export const createTableDialogRef = createRef<{
  create: (schema?: string) => void
}>()

export const CreateTableDialog = () => {
  const { connectionResource, defaultSchema, dialect } = useConnectionContext()
  const router = useRouter()
  const [request, setRequest] = useState<TableDialogRequest | null>(null)
  const { data: tablesAndSchemas } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const schemas = tablesAndSchemas?.schemas ?? []

  const {
    error,
    isPending,
    mutate: createTable,
    reset,
  } = useMutation({
    meta: { event: 'table_created' },
    mutationFn: async ({
      schema,
      table,
    }: {
      schema: string
      table: string
    }) => {
      await createTableQuery({
        columns: [
          {
            name: engineName(dialect, 'id'),
            nullable: false,
            primaryKey: true,
            type: getCapabilities(dialect).columnTypes.id,
          },
        ],
        schema,
        table,
      }).run(await connectionResourceToQueryParams(connectionResource))
    },
    onSuccess: async (_, { schema, table }) => {
      setRequest(null)
      await queryClient.invalidateQueries({
        queryKey: ['connection-resource', connectionResource.id],
      })
      openTab(connectionResource.id, tableTabId(schema, table))
      router.navigate({
        params: {
          resourceId: connectionResource.id,
          tabId: tableTabId(schema, table),
        },
        to: '/connection/$resourceId/$tabId',
      })
    },
  })

  useImperativeHandle(createTableDialogRef, () => ({
    create: (schema) => {
      reset()
      setRequest({
        schema: schema ?? defaultSchema ?? schemas[0]?.name ?? '',
        table: null,
      })
    },
  }))

  const { names } = getCapabilities(dialect)

  return (
    <TableDialog
      noun={names.table}
      description={`The ${names.table} is created with an ${isSqlDialect(dialect) ? 'id' : '_id'} primary key.`}
      error={error}
      request={request}
      schemas={schemas.map(({ name }) => name)}
      isTaken={(schema, name) =>
        schemas.some(
          (entry) =>
            entry.name === schema &&
            entry.tables.some((table) => table.name === name)
        )
      }
      pending={isPending}
      onOpenChange={(open) => !open && setRequest(null)}
      onSubmit={(_, schema, table) => createTable({ schema, table })}
    />
  )
}
