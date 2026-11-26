import { Favicon } from '@tamery/ui/components/favicon'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import type * as React from 'react'

/** A page an answer read: its site's icon and its title, opening in the browser; the address shows on hover. */
const Source = ({
  className,
  href,
  title,
  ...props
}: Omit<React.ComponentProps<'a'>, 'children'> & {
  href: string
  title: string
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        // oxlint-disable-next-line jsx-a11y/anchor-has-content -- the trigger renders the title inside this anchor
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          data-slot="source"
          className={cn(
            'text-foreground hover:bg-accent focus-visible:focus-ring flex h-6 min-w-0 cursor-default items-center gap-2 rounded-md px-1.5 text-xs transition-colors outline-none',
            className
          )}
          {...props}
        />
      }
    >
      <Favicon host={new URL(href).hostname} className="size-3.5 shrink-0" />
      <span className="truncate">{title}</span>
    </TooltipTrigger>
    <TooltipContent className="max-w-80 truncate">
      {href.replace(/^https?:\/\//u, '')}
    </TooltipContent>
  </Tooltip>
)

export { Source }
