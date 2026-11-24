import { Separator } from '@tamery/ui/components/separator'
import type { ComponentRef, RefObject } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'

import { createViewDialogRef } from './create-view-dialog'
import type { DropSchemaDialog } from './drop-schema-dialog'
import type { DropTableDialog } from './drop-table-dialog'
import type { RenameSchemaDialog } from './rename-schema-dialog'
import type { RenameTableDialog } from './rename-table-dialog'
import { SchemaRow } from './schema-row'
import { TableRow } from './table-row'
import type { TreeRow } from './tree-row'

export const TreeRowContent = ({
  controlId,
  dialogs,
  onCreateTable,
  onToggleSchema,
  row,
  search,
}: {
  controlId?: string
  dialogs: {
    dropSchema: RefObject<ComponentRef<typeof DropSchemaDialog> | null>
    dropTable: RefObject<ComponentRef<typeof DropTableDialog> | null>
    renameSchema: RefObject<ComponentRef<typeof RenameSchemaDialog> | null>
    renameTable: RefObject<ComponentRef<typeof RenameTableDialog> | null>
  }
  onCreateTable: (schema?: string) => void
  onToggleSchema: (name: string) => void
  row: TreeRow
  search?: string
}) => {
  const { dialect } = useConnectionContext()
  const names = useObjectNames()

  if (row.kind === 'schema') {
    return (
      <div className="h-full pt-0.5 pb-1">
        <SchemaRow
          controlId={controlId}
          row={row}
          onCreateTable={() => onCreateTable(row.name)}
          onCreateView={() => createViewDialogRef.current?.create(row.name)}
          onDrop={() => dialogs.dropSchema.current?.drop(row.name)}
          onRename={
            getCapabilities(dialect).flags.includes('renameSchema')
              ? () => dialogs.renameSchema.current?.rename(row.name)
              : undefined
          }
          onToggle={() => onToggleSchema(row.name)}
        />
      </div>
    )
  }

  if (row.kind === 'empty') {
    return (
      <p className="text-muted-foreground flex h-full items-center pb-0.5 pl-2 text-xs">
        No {names.table}s
      </p>
    )
  }

  if (row.kind === 'separator') {
    return (
      <div className="flex h-full items-center">
        <Separator className="mx-2 w-full" />
      </div>
    )
  }

  return (
    <div className="pb-0.5">
      <TableRow
        controlId={controlId}
        row={row}
        search={search}
        onRename={
          row.table.type === 'table' ||
          getCapabilities(dialect).flags.includes('renameViews')
            ? () =>
                dialogs.renameTable.current?.rename(
                  row.schema,
                  row.table.name,
                  row.table.type
                )
            : undefined
        }
        onDrop={() =>
          dialogs.dropTable.current?.drop(
            row.schema,
            row.table.name,
            row.table.type
          )
        }
      />
    </div>
  )
}
