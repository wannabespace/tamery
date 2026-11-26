import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'

const HEIGHTS = { short: 'max-h-16', tall: 'max-h-56' } as const

/** Long content shows its top and a toggle for the rest; content that fits shows whole, with no toggle. */
export const Clamped = ({
  children,
  height = 'tall',
}: {
  children: ReactNode
  height?: keyof typeof HEIGHTS
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLong, setIsLong] = useState(false)

  useLayoutEffect(() => {
    if (ref.current && !isOpen && children) {
      setIsLong(ref.current.scrollHeight > ref.current.clientHeight)
    }
  }, [isOpen, children])

  return (
    <>
      <div
        ref={ref}
        className={cn(
          'w-full',
          !isOpen && ['overflow-hidden', HEIGHTS[height]]
        )}
      >
        {children}
      </div>
      {isLong && (
        <Button
          variant="link-muted"
          size="xs"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Show less' : 'Show more'}
        </Button>
      )}
    </>
  )
}
