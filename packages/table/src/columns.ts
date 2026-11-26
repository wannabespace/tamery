import type { CSSProperties } from 'react'

import { GUTTER_WIDTH } from './constants'

export interface GridColumn {
  id: string
  size: number
  fixed?: boolean
  /** Takes the room the columns leave in the row; only for the last column. */
  grow?: boolean
  /** Pinned columns must lead the list. */
  pinned?: boolean
}

// A custom property name must be a plain ident: `setProperty` takes the name
// literally while `var()` unescapes it, so a `CSS.escape`d id never matches.
export const columnVars = (id: string) => {
  const key = id.replaceAll(
    /[^a-zA-Z0-9-]/gu,
    (char) => `_${char.codePointAt(0)}_`
  )
  return {
    shift: `--grid-shift-${key}`,
    width: `--grid-width-${key}`,
  }
}

// The fallback is what a server render draws: the variables are only set on the client.
const liveWidth = (column: GridColumn) =>
  `var(${columnVars(column.id).width}, ${column.size}px)`

export const pinnedCount = (columns: GridColumn[]) => {
  const index = columns.findIndex((column) => !column.pinned)
  return index === -1 ? columns.length : index
}

// Sums the live width variables, not `size`, so pinned offsets follow a resize drag before it commits.
const pinnedLeft = (columns: GridColumn[], index: number) =>
  `calc(${[`${GUTTER_WIDTH}px`, ...columns.slice(0, index).map(liveWidth)].join(' + ')})`

export const pinnedWidth = (columns: GridColumn[]) => {
  const count = pinnedCount(columns)
  return count > 0 ? pinnedLeft(columns, count) : '0px'
}

export const columnStyle = (
  columns: GridColumn[],
  column: GridColumn,
  index: number
): CSSProperties => {
  const vars = columnVars(column.id)
  return {
    flexShrink: 0,
    translate: `calc(var(${vars.shift}, 0) * 1px)`,
    width: liveWidth(column),
    ...(column.grow && { flexGrow: 1, marginRight: GUTTER_WIDTH }),
    ...(column.pinned && {
      left: pinnedLeft(columns, index),
      position: 'sticky',
    }),
  }
}

export const columnSlots = (columns: GridColumn[]) => {
  let left = 0
  return new Map(
    columns.map((column) => {
      const slot = left
      left += column.size
      return [column.id, slot]
    })
  )
}
