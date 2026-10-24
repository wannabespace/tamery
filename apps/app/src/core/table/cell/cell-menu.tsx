import {
  ArrowDown02Icon,
  BracesIcon,
  CodeIcon,
  Copy01Icon,
  Csv01Icon,
  PencilEdit02Icon,
  TextIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { recordToMarkdownTable, toCSV } from '@tamery/shared/files'
import { uppercaseFirst } from '@tamery/shared/utils'
import { valueToText } from '@tamery/shared/value-text'
import { copy } from '@tamery/ui/lib/copy'

import type { AppMenuNode } from '~/components/app-menu'

import type { DataGridCell, GridCursor } from '../cursor'

export interface CellMenuExtra {
  cell?: AppMenuNode[]
  groups?: AppMenuNode[]
  row?: AppMenuNode[]
}

export const cellMenu = ({
  columns,
  cursor,
  extra,
  row: rowNoun,
}: {
  columns: string[]
  cursor: GridCursor
  /** What the engine calls a row. */
  row: string
  extra?: (
    cell: DataGridCell,
    element: Element | null | undefined
  ) => CellMenuExtra
}): AppMenuNode[] => {
  const cell = cursor.current()
  if (!cell) {
    return []
  }
  const Row = uppercaseFirst(rowNoun)
  const { row } = cell
  const editable = cursor.isEditable(cell.column, cell.rowIndex)
  const cells = cursor.selection().flat().length
  const extras = extra?.(cell, cursor.element()) ?? {}
  const keys = columns.map((key) => ({ key }))
  return [
    {
      items: [
        {
          icon: editable ? PencilEdit02Icon : ViewIcon,
          label: editable ? 'Edit Value' : 'View Value',
          onSelect: () => cursor.edit(),
        },
        ...(cursor.canPeek(cell)
          ? [{ icon: BracesIcon, label: 'Show JSON', onSelect: cursor.preview }]
          : []),
        {
          icon: Copy01Icon,
          label: cells > 1 ? `Copy ${cells} Cells` : 'Copy Value',
          onSelect: cursor.copy,
          shortcut: 'copy',
        },
        ...(editable && cursor.selection().length > 1
          ? [
              {
                icon: ArrowDown02Icon,
                label: 'Fill Down',
                onSelect: cursor.fillDown,
                shortcut: 'fillDown',
              } satisfies AppMenuNode,
            ]
          : []),
        ...(extras.cell ?? []),
      ],
      label: 'Cell',
      type: 'group',
    },
    ...(extras.groups
      ? [{ type: 'separator' } as const, ...extras.groups]
      : []),
    { type: 'separator' },
    {
      items: [
        ...(extras.row ?? []),
        {
          icon: Copy01Icon,
          items: [
            {
              icon: CodeIcon,
              label: 'JSON',
              onSelect: () =>
                copy(valueToText(row, 2), `${Row} copied as JSON`),
            },
            {
              icon: Csv01Icon,
              label: 'CSV',
              onSelect: () => copy(toCSV(keys, [row]), `${Row} copied as CSV`),
            },
            {
              icon: TextIcon,
              label: 'Markdown',
              onSelect: () =>
                copy(
                  recordToMarkdownTable(row, keys),
                  `${Row} copied as Markdown table`
                ),
            },
          ],
          label: `Copy ${Row} As`,
          type: 'sub',
        },
      ],
      label: Row,
      type: 'group',
    },
  ]
}
