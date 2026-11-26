import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import type { ReactNode } from 'react'

export interface CellContext {
  schema: string | undefined
  search: string
}

export type ColumnWidth = '2/12' | '3/12' | '4/12'

export type SortValue = number | string | null | undefined

export interface DefinitionsColumn<T> {
  align?: 'end'
  cell: (item: T, context: CellContext) => ReactNode
  header: string
  sortValue?: (item: T) => SortValue
  width?: ColumnWidth
}

export const nameColumn = <T extends { name: string }>({
  after,
  icon,
  width,
}: {
  after?: (item: T) => ReactNode
  icon: (item: T) => IconSvgElement
  width: ColumnWidth
}): DefinitionsColumn<T> => ({
  cell: (item, { search }) => (
    <span data-mask className="flex min-w-0 items-center gap-2">
      <HugeiconsIcon
        icon={icon(item)}
        strokeWidth={2}
        className="text-muted-foreground size-4 shrink-0"
      />
      <span className="truncate">
        <HighlightText text={item.name} match={search} />
      </span>
      {after?.(item)}
    </span>
  ),
  header: 'Name',
  sortValue: (item) => item.name,
  width,
})

export const textColumn = <T,>({
  header,
  valueOf,
  width,
}: {
  header: string
  valueOf: (item: T) => string | null | undefined
  width?: ColumnWidth
}): DefinitionsColumn<T> => ({
  cell: (item, { search }) => (
    <span data-mask>
      <HighlightText text={valueOf(item) ?? ''} match={search} />
    </span>
  ),
  header,
  sortValue: valueOf,
  width,
})

export const numberColumn = <T,>({
  format,
  header,
  valueOf,
  width,
}: {
  format: (value: number) => string
  header: string
  valueOf: (item: T) => number | undefined
  width?: ColumnWidth
}): DefinitionsColumn<T> => ({
  align: 'end',
  cell: (item) => {
    const value = valueOf(item)
    return (
      <span className="text-muted-foreground tabular-nums">
        {value === undefined ? '' : format(value)}
      </span>
    )
  },
  header,
  sortValue: valueOf,
  width,
})

export const labelColumn = <T,>({
  align,
  header,
  getLabel,
  width,
}: {
  align?: 'end'
  header: string
  getLabel: (item: T, context: CellContext) => ReactNode
  width?: ColumnWidth
}): DefinitionsColumn<T> => ({
  align,
  cell: (item, context) => (
    <span className="text-muted-foreground">{getLabel(item, context)}</span>
  ),
  header,
  width,
})
