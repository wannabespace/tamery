import { useMutation } from '@tanstack/react-query'
import { createRef, useImperativeHandle, useState } from 'react'
import { toast } from 'sonner'

import { useConnectionContext } from '~/core/connection/route'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import type { ConstraintShape } from '~/core/queries/constraints/shape'
import { foreignKeyName } from '~/core/queries/constraints/shape'
import { resourceEnumsQueryOptions } from '~/core/queries/enums/list'
import { structureQueryKey } from '~/core/queries/indexes/list'
import { resourceRowsQueryKey } from '~/core/queries/rows/list'
import type { RenamedValue } from '~/core/queries/shared/inline-enum'
import { addColumnQuery } from '~/core/queries/tables/add-column'
import {
  getColumnDefinition,
  resourceColumnsQueryKey,
} from '~/core/queries/tables/columns'
import { editColumnQuery } from '~/core/queries/tables/edit-column'
import type { ColumnDefinition, NewColumn } from '~/core/queries/tables/shape'
import {
  connectionResourceToQueryParams,
  transaction,
} from '~/core/runtime/query'
import type { Column } from '~/core/table/cell/utils'
import type { ColumnDialogRequest } from '~/core/table/column-dialog'
import { ColumnDialog } from '~/core/table/column-dialog'
import type { SubmittedColumn } from '~/core/table/submitted-column'
import type { ColumnReference } from '~/core/table/use-reference-targets'
import { queryClient } from '~/lib/query-client'

import { useTableColumnsContext } from '../../lib/columns'

export const columnDialogRef = createRef<{
  add: () => void
  edit: (column: Column) => void
}>()

interface TableColumn extends NewColumn {
  comment: string | null
  foreign: boolean
  id: string
  original: ColumnDefinition
}

type Request = ColumnDialogRequest<ColumnDialogRequest['table'], TableColumn>

export const TableColumnDialog = ({
  schema,
  table,
}: {
  schema: string
  table: string
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { columns } = useTableColumnsContext()
  const [request, setRequest] = useState<Request | null>(null)
  const open = (column: TableColumn | null) =>
    setRequest({
      column,
      table: {
        columns: columns.map(({ id }) => ({ id, name: id })),
        name: table,
      },
    })

  useImperativeHandle(columnDialogRef, () => ({
    add: () => open(null),
    edit: (column) => {
      const original = getColumnDefinition(column)
      open({
        comment: original.comment,
        foreign: !!column.foreign,
        id: column.id,
        name: column.id,
        nullable: original.nullable,
        original,
        primaryKey: !!column.primaryKey,
        type: original.type,
      })
    },
  }))

  const { mutate: saveColumn, isPending } = useMutation({
    meta: { event: 'column_saved' },
    mutationFn: async ({
      next,
      reference,
      renamedValues,
      request: { column },
    }: {
      next: SubmittedColumn
      reference: ColumnReference | null
      renamedValues: RenamedValue[]
      request: Request
    }) => {
      const params = await connectionResourceToQueryParams(connectionResource)
      const constraints = reference
        ? await queryClient.query({
            ...resourceConstraintsQueryOptions({ connectionResource }),
            staleTime: 'static',
          })
        : []
      const foreignKey: ConstraintShape | undefined = reference
        ? {
            columns: [next.name],
            expression: '',
            foreignColumns: [reference.column],
            foreignSchema: reference.schema,
            foreignTable: reference.table,
            kind: 'foreignKey',
            name: foreignKeyName(
              dialect,
              table,
              next.name,
              new Set(
                constraints
                  .filter((c) => c.schema === schema)
                  .map((c) => c.name)
              )
            ),
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION',
          }
        : undefined
      await transaction(params).execute((tx) =>
        (column === null
          ? addColumnQuery({
              column: next,
              reference: foreignKey,
              schema,
              table,
            })
          : editColumnQuery({
              column: column.id,
              comment: next.comment,
              newName: next.name,
              nullable: next.nullable,
              original: column.original,
              reference: foreignKey,
              renamedValues,
              schema,
              table,
              type: next.type,
            })
        ).run(params, tx)
      )
    },
    onError: (error, { request: { column } }) => {
      toast.error(
        `Failed to ${column ? 'save' : 'add'} column "${error.message}".`
      )
    },
    // MySQL and ClickHouse keep what ran before a failing statement, so the
    // grid refreshes on failure too.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: resourceColumnsQueryKey({ connectionResource }),
        }),
        queryClient.invalidateQueries({
          queryKey: resourceRowsQueryKey({ connectionResource, schema, table }),
        }),
        queryClient.invalidateQueries({
          queryKey: structureQueryKey(connectionResource),
        }),
        queryClient.invalidateQueries(
          resourceEnumsQueryOptions({ connectionResource })
        ),
      ]),
    onSuccess: () => setRequest(null),
  })

  return (
    <ColumnDialog
      request={request}
      pending={isPending}
      onOpenChange={(isOpen) => !isOpen && setRequest(null)}
      onSubmit={(submitted, next, reference, renamedValues) =>
        saveColumn({ next, reference, renamedValues, request: submitted })
      }
    />
  )
}
