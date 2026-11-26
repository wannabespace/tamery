import { cn } from '@tamery/ui/lib/utils'
import type { ComponentProps, MouseEvent as ReactMouseEvent } from 'react'
import { useState } from 'react'

let dragOverlay: HTMLDivElement | undefined

const showDragOverlay = () => {
  dragOverlay ??= document.createElement('div')
  dragOverlay.className =
    'fixed top-0 left-0 z-1000 size-full cursor-col-resize'

  if (!dragOverlay.parentElement) {
    document.body.append(dragOverlay)
  }
}

export const ResizeHandle = ({
  getValue,
  onResize,
  onResizingChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  side = 'right',
  className,
  children,
  onMouseDown,
  ...props
}: {
  getValue: () => number
  onResize: (value: number) => void
  onResizingChange?: (resizing: boolean) => void
  min?: number
  max?: number
  side?: 'left' | 'right'
} & Omit<ComponentProps<'div'>, 'onResize'>) => {
  const [isResizing, setIsResizing] = useState(false)

  const setResizing = (resizing: boolean) => {
    setIsResizing(resizing)
    onResizingChange?.(resizing)
  }

  const startResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setResizing(true)

    const startX = event.clientX
    const startValue = getValue()
    const direction = side === 'right' ? 1 : -1

    const handleMouseMove = (moveEvent: MouseEvent) => {
      showDragOverlay()
      onResize(
        Math.min(
          max,
          Math.max(min, startValue + direction * (moveEvent.clientX - startX))
        )
      )
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      setResizing(false)
      dragOverlay?.remove()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- interactive resize handle
      role="separator"
      aria-orientation="vertical"
      tabIndex={-1}
      data-resizing={isResizing || undefined}
      className={cn(
        'group/resize-handle cursor-col-resize outline-none select-none',
        className
      )}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        startResize(event)
      }}
      {...props}
    >
      {children}
    </div>
  )
}
