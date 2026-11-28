import type { Dialect } from '@tamery/shared/enums/connection-type'
import { omit } from '@tamery/shared/utils'
import { valueToText } from '@tamery/shared/value-text'
import type { ColumnAlign } from '@tamery/ui/components/response'
import { useState } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { Column } from '~/core/table/cell/utils'
import { PlainHeader } from '~/core/table/column-grid'
import { ColumnResizeHandle } from '~/core/table/column-resize-handle'
import { DataGrid } from '~/core/table/data-grid'

const CHAR_WIDTH = 7
const CELL_PADDING = 40
const MIN_WIDTH = 96
const MAX_WIDTH = 480
const MAX_LAST_WIDTH = 1200
const SAMPLED_ROWS = 50

const columnWidth = (
  columnId: string,
  rows: Record<string, unknown>[],
  isLast: boolean
) => {
  const longest = Math.max(
    columnId.length,
    ...rows
      .slice(0, SAMPLED_ROWS)
      .map((row) => valueToText(row[columnId]).length)
  )
  return Math.min(
    Math.max(longest * CHAR_WIDTH + CELL_PADDING, MIN_WIDTH),
    isLast ? MAX_LAST_WIDTH : MAX_WIDTH
  )
}

export const ResultsTable = ({
  aligns,
  columns,
  rows,
  dialect,
  resizable,
}: {
  aligns?: ColumnAlign[]
  columns: string[]
  rows: Record<string, unknown>[]
  dialect: Dialect
  /** Drag a column edge to resize it; widths live until the table unmounts. */
  resizable?: boolean
}) => {
  const [widths, setWidths] = useState<Record<string, number>>({})

  return (
    <DataGrid
      rows={rows}
      columns={columns.map((id, index): Column => {
        const align = aligns?.[index]
        return {
          align: align === 'start' ? undefined : align,
          id,
          uiType: 'raw',
        }
      })}
      dialect={dialect}
      getSize={(column) =>
        widths[column.id] ??
        columnWidth(column.id, rows, column.id === columns.at(-1))
      }
      renderHeader={
        resizable
          ? (column, header) => (
              <PlainHeader column={column} header={header}>
                <ColumnResizeHandle
                  label={`Resize ${column.id} ${getCapabilities(dialect).names.column}`}
                  setWidth={header.setWidth}
                  onResize={(width) =>
                    setWidths((current) => ({ ...current, [column.id]: width }))
                  }
                  onReset={() =>
                    setWidths((current) => omit(current, [column.id]))
                  }
                />
              </PlainHeader>
            )
          : undefined
      }
    />
  )
}
