/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a virtualized grid cannot be built from table elements */
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useEffect, useEffectEvent } from 'react'

import { DEFAULT_ROW_HEIGHT } from './constants'

const END_REACHED_DISTANCE = 20 * DEFAULT_ROW_HEIGHT

export interface GridScrollerProps {
  footer?: ReactNode
  isFetching?: boolean
  onEndReached?: () => void
  renderBody: (body: ReactNode) => ReactNode
  scrollRef: RefObject<HTMLDivElement | null>
}

export const GridScroller = ({
  children,
  colCount,
  footer,
  header,
  isFetching,
  onEndReached,
  pinnedWidth,
  renderBody,
  rowCount,
  rows,
  scrollRef,
  width = 0,
}: GridScrollerProps & {
  children: ReactNode
  colCount?: number
  header?: ReactNode
  pinnedWidth?: string
  rowCount: number
  rows: { totalSize: number; virtualItems: VirtualItem[] }
  width?: number
}) => {
  const reachEnd = useEffectEvent(() => onEndReached?.())
  const isNearEnd =
    rowCount > 0 &&
    (rows.virtualItems.at(-1)?.end ?? 0) >=
      rows.totalSize - END_REACHED_DISTANCE
  useEffect(() => {
    if (isNearEnd && !isFetching) {
      reachEnd()
    }
  }, [isFetching, isNearEnd])

  return (
    <ScrollArea
      ref={scrollRef}
      role="grid"
      tabIndex={0}
      aria-rowcount={header ? rowCount + 1 : rowCount}
      aria-colcount={colCount}
      className="group/grid table-scroller relative isolate size-full scroll-pl-(--grid-pinned) outline-none"
      style={
        {
          '--grid-pinned': pinnedWidth,
          '--grid-row-height': `${DEFAULT_ROW_HEIGHT}px`,
        } as CSSProperties
      }
    >
      <div
        style={{ '--grid-width': `${width}px` } as CSSProperties}
        className="w-(--grid-width) min-w-full"
      >
        {header}
        {renderBody(
          <div
            role="rowgroup"
            className="relative h-(--grid-height) pt-(--grid-top) contain-layout"
            style={
              {
                '--grid-height': `${rows.totalSize}px`,
                '--grid-top': `${rows.virtualItems[0]?.start ?? 0}px`,
              } as CSSProperties
            }
          >
            {children}
          </div>
        )}
        {footer}
      </div>
    </ScrollArea>
  )
}
