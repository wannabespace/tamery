import { cn } from '@tamery/ui/lib/utils'
import type { ComponentProps } from 'react'

/**
 * A command, file or name inside a sentence: set off by its own surface, since the mono face alone reads as a typo. Colour
 * and surface follow the text around it, so it reads the same in a muted line, on a card or in an inverted tooltip.
 */
export const InlineCode = ({ className, ...props }: ComponentProps<'code'>) => (
  <code
    className={cn(
      'rounded-md bg-current/10 px-1.5 py-0.5 font-mono text-[0.9em]',
      className
    )}
    {...props}
  />
)
