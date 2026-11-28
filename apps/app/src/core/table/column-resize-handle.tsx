import { ResizeHandle } from '@tamery/ui/components/custom/resize-handle'
import { cn } from '@tamery/ui/lib/utils'
import { useRef } from 'react'

const MIN_WIDTH = 100

/** Must be a direct child of a `group/header relative` header cell: it measures its parent. `onResize` fires once, on release. */
export const ColumnResizeHandle = ({
  hidden,
  label,
  onReset,
  onResize,
  setWidth,
}: {
  hidden?: boolean
  label: string
  onReset: () => void
  onResize: (width: number) => void
  setWidth: (width: number) => void
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const width = useRef(0)

  return (
    <ResizeHandle
      ref={ref}
      aria-label={label}
      min={MIN_WIDTH}
      className={cn(
        'absolute inset-y-0 right-0 z-10 flex w-3 justify-end',
        hidden && 'hidden'
      )}
      getValue={() =>
        ref.current?.parentElement?.getBoundingClientRect().width ?? 0
      }
      onResize={(next) => {
        width.current = next
        setWidth(next)
      }}
      onResizingChange={(resizing) => {
        if (!resizing && width.current) {
          onResize(width.current)
        }
        width.current = 0
      }}
      onDoubleClick={onReset}
    >
      <span className="bg-foreground/20 group-hover/resize-handle:bg-primary group-data-resizing/resize-handle:bg-primary w-0.5 opacity-0 transition-opacity group-hover/header:opacity-100 group-data-resizing/resize-handle:opacity-100" />
    </ResizeHandle>
  )
}
