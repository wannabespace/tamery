import { ArrowUpRight01Icon, GlobeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Favicon } from '@tamery/ui/components/favicon'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import type * as React from 'react'
import { use } from 'react'
import type { ExtraProps } from 'streamdown'

import { ResponseSlotsContext } from './response-slots'

export const ResponseLink = ({
  children,
  href,
  node: _node,
  ...props
}: React.ComponentProps<'a'> & ExtraProps) => {
  const { linkPreview } = use(ResponseSlotsContext)
  const url = linkPreview && href ? URL.parse(href) : null
  if (!(href && url?.protocol.startsWith('http'))) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
  const site = url.hostname.replace(/^www\./u, '')
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={300}
        render={
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the trigger renders the link's text inside this anchor
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-foreground decoration-foreground/30 hover:decoration-foreground underline underline-offset-4 transition-colors"
          />
        }
      >
        <Favicon
          host={url.hostname}
          className="mr-1 inline size-4 align-text-bottom"
        />
        {typeof children === 'string' && URL.canParse(children)
          ? site
          : children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        padding="none"
        className="w-auto"
      >
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground flex max-w-80 items-center gap-2 px-3 py-2 text-xs transition-colors"
        >
          <HugeiconsIcon
            icon={GlobeIcon}
            strokeWidth={2}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">
            {href.replace(/^https?:\/\//u, '').replace(/\/$/u, '')}
          </span>
          <HugeiconsIcon
            icon={ArrowUpRight01Icon}
            strokeWidth={2}
            className="size-3.5 shrink-0"
          />
        </a>
      </PopoverContent>
    </Popover>
  )
}
