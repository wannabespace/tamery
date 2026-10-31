import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

export const ProductCrop = ({
  children,
  className,
  stage,
}: {
  children: ReactNode
  className?: string
  stage?: boolean
}) => (
  // The mask clips to this box, so the window keeps padding above it to lift into on hover.
  <div
    className={cn(
      'absolute mask-b-from-70%',
      stage
        ? 'inset-x-6 top-6 bottom-0 pt-4 sm:inset-x-12 lg:inset-x-20'
        : 'inset-0 pt-5 pl-6'
    )}
  >
    <div
      className={cn(
        'bg-popover ring-foreground/4 h-full w-full min-w-120 overflow-hidden ring transition-transform duration-300 ease-out group-hover:-translate-y-1 motion-reduce:transition-none',
        stage
          ? 'mx-auto max-w-3xl rounded-t-xl shadow-xl'
          : 'rounded-tl-xl shadow-md',
        className
      )}
    >
      {children}
    </div>
  </div>
)
