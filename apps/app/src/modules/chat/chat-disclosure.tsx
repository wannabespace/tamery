import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tamery/ui/components/collapsible'
import { cn } from '@tamery/ui/lib/utils'
import type * as React from 'react'

/** A step's line; with children it opens to show them, without it is a plain line. */
export const ChatDisclosure = ({
  children,
  icon: Icon,
  label,
  live = false,
  status,
  summary,
}: {
  children?: React.ReactNode
  icon: IconSvgElement
  label: React.ReactNode
  /** The step is running: its label shimmers. */
  live?: boolean
  status?: React.ReactNode
  /** What the step found, muted after its label: `5 columns`, `3 matches`. */
  summary?: string | null
}) => {
  const line = (
    <>
      <HugeiconsIcon icon={Icon} strokeWidth={2} className="size-3.5" />
      <span className={cn('truncate', live && 'shimmer')}>{label}</span>
      {summary && <span className="text-muted-foreground/70">{summary}</span>}
      {status}
    </>
  )
  if (!children) {
    return (
      <div className="text-muted-foreground flex h-5 items-center gap-1.5 text-xs">
        {line}
      </div>
    )
  }
  return (
    <Collapsible>
      <CollapsibleTrigger variant="disclosure" className="group">
        {line}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-3 transition-transform duration-200 group-data-panel-open:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent variant="disclosure" className="mt-1.5 mb-1 ml-1.5">
        <div className="flex flex-col gap-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
