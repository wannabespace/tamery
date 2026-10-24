import { useMutation, useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from '@tanstack/react-router'
import { useImperativeHandle, useState } from 'react'
import { toast } from 'sonner'

import type { TableType } from '~/core/catalog/table-type'
import { getTableTypeLabel } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { renameTableQuery } from '~/core/queries/tables/rename'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import type { TableDialogRequest } from '~/core/table/table-dialog'
import { TableDialog } from '~/core/table/table-dialog'
import { tableTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'

import { pinnedTable } from './pinned-tables'

interface RenameTableDialogProps {
  ref: React.RefObject<{
    rename: (schema: string, table: string, type: TableType) => void
  } | null>
}

export const RenameTableDialog = ({ ref }: RenameTableDialogProps) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { tabId: activeTabId } = useParams({ strict: false })
  const router = useRouter()
  const [request, setRequest] = useState<TableDialogRequest | null>(null)
  const [type, setType] = useState<TableType>('table')
  const { data: tablesAndSchemas } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const schemas = tablesAndSchemas?.schemas ?? []
  const label = getTableTypeLabel(dialect, type)
  const noun = label.toLowerCase()

  const {
    error,
    isPending,
    mutate: renameTable,
    reset,
  } = useMutation({
    meta: { event: type === 'table' ? 'table_renamed' : 'view_renamed' },
    mutationFn: async ({
      newTable,
      schema,
      table,
    }: {
      newTable: string
      schema: string
      table: string
    }) => {
      await renameTableQuery({ newTable, oldTable: table, schema }).run(
        await connectionResourceToQueryParams(connectionResource)
      )
    },
    onSuccess: async (_, { newTable, schema, table }) => {
      toast.success(`${label} "${table}" successfully renamed to "${newTable}"`)
      setRequest(null)

      await queryClient.invalidateQueries({
        queryKey: ['connection-resource', connectionResource.id],
      })
      pinnedTable.rename(connectionResource.id, schema, table, newTable)

      if (activeTabId === tableTabId(schema, table)) {
        router.navigate({
          params: {
            resourceId: connectionResource.id,
            tabId: tableTabId(schema, newTable),
          },
          replace: true,
          to: '/connection/$resourceId/$tabId',
        })
      }
    },
  })

  useImperativeHandle(ref, () => ({
    rename: (schema, name, nextType) => {
      reset()
      setType(nextType)
      setRequest({ schema, table: { name, schema } })
    },
  }))

  return (
    <TableDialog
      error={error}
      noun={noun}
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
      onSubmit={({ table }, schema, newTable) =>
        table && renameTable({ newTable, schema, table: table.name })
      }
    />
  )
}
