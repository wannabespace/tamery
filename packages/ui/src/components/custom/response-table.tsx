import { cn } from '@tamery/ui/lib/utils'
import type * as React from 'react'
import { use } from 'react'
import type { ExtraProps } from 'streamdown'

import type { ColumnAlign } from './response-slots'
import { ResponseSlotsContext } from './response-slots'

type HastNode = NonNullable<ExtraProps['node']>
type HastChild = HastNode['children'][number]

const getText = (node: HastChild): string => {
  if (node.type === 'text') {
    return node.value
  }
  return node.type === 'element' ? node.children.map(getText).join('') : ''
}

const getRows = (node: HastNode): HastNode[][] =>
  node.children.flatMap((child) => {
    if (child.type !== 'element') {
      return []
    }
    return child.tagName === 'tr'
      ? [child.children.filter((cell) => cell.type === 'element')]
      : getRows(child)
  })

const getTexts = (cells: HastNode[]) =>
  cells.map((cell) => getText(cell).trim())

const getAlign = ({ properties: { align } }: HastNode): ColumnAlign =>
  align === 'center' || align === 'right' ? align : 'start'

export const ResponseTable = ({
  className,
  node,
  ...props
}: React.ComponentProps<'table'> & ExtraProps) => {
  const { table } = use(ResponseSlotsContext)
  const [header, ...rows] = table && node ? getRows(node) : []
  if (table && header) {
    return (
      <div className="my-4">
        {table({
          aligns: header.map(getAlign),
          columns: getTexts(header),
          rows: rows.map(getTexts),
        })}
      </div>
    )
  }
  return (
    <div className="bg-background ring-foreground/4 my-4 overflow-x-auto rounded-xl ring">
      <table
        className={cn('w-full text-xs whitespace-nowrap', className)}
        data-mask
        {...props}
      />
    </div>
  )
}

export const ResponseTableHead = ({
  className,
  node: _node,
  ...props
}: React.ComponentProps<'th'> & ExtraProps) => (
  <th
    className={cn(
      'h-8 border-b px-2 text-left font-medium not-last:border-r first:pl-4',
      className
    )}
    {...props}
  />
)

export const ResponseTableCell = ({
  className,
  node: _node,
  ...props
}: React.ComponentProps<'td'> & ExtraProps) => (
  <td
    className={cn(
      'h-8 border-b px-2 not-last:border-r first:pl-4 in-[tr:last-child]:border-b-0',
      className
    )}
    {...props}
  />
)

export const ResponseTableHeader = ({
  node: _node,
  ...props
}: React.ComponentProps<'thead'> & ExtraProps) => <thead {...props} />

export const ResponseTableBody = ({
  node: _node,
  ...props
}: React.ComponentProps<'tbody'> & ExtraProps) => <tbody {...props} />
