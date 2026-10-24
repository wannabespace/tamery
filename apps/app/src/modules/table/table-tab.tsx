import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import {
  tableSessionStore,
  TableSessionStoreContext,
} from '~/core/table/session'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'

import { DeleteRowsDialog } from './components/table/actions-delete'
import {
  columnDialogRef,
  TableColumnDialog,
} from './components/table/column-dialog'
import { Table } from './components/table/table'
import { TableToolbar } from './components/toolbar/toolbar'
import { ColumnsContext, useTableColumnsQuery } from './lib/columns'
import { tablePageStore, TablePageStoreContext } from './lib/store'
import type { TableParams } from './lib/tab'

const addColumn = () => columnDialogRef.current?.add()

const TableContent = ({ table, schema }: { table: string; schema: string }) => {
  const { connectionResource, dialect } = useConnectionContext()
  const onAddColumn = getCapabilities(dialect).flags.includes('declaredColumns')
    ? addColumn
    : undefined
  const { data = [], isPending } = useTableColumnsQuery({
    connectionResource,
    schema,
    table,
  })

  return (
    <ColumnsContext value={{ columns: data, isPending }}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        onClick={() =>
          openTab(connectionResource.id, tableTabId(schema, table))
        }
      >
        <TableToolbar table={table} schema={schema} onAddColumn={onAddColumn} />
        <div className="relative min-h-0 flex-1 border-t">
          <Table table={table} schema={schema} onAddColumn={onAddColumn} />
        </div>
      </div>
      <TableColumnDialog schema={schema} table={table} />
      <DeleteRowsDialog schema={schema} table={table} />
    </ColumnsContext>
  )
}

export const TableTab = ({
  params: { schema, table },
}: {
  params: TableParams
}) => {
  const { connectionResource } = useConnectionContext()
  const storeKey = { id: connectionResource.id, schema, table }

  return (
    <TablePageStoreContext value={tablePageStore(storeKey)}>
      <TableSessionStoreContext value={tableSessionStore(storeKey)}>
        <TableContent table={table} schema={schema} />
      </TableSessionStoreContext>
    </TablePageStoreContext>
  )
}
