import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tamery/ui/components/collapsible'
import type * as React from 'react'

export const ChatDisclosure = ({
  children,
  icon: Icon,
  label,
  status,
}: {
  children: React.ReactNode
  icon: IconSvgElement
  label: React.ReactNode
  status?: React.ReactNode
}) => (
  <Collapsible>
    <CollapsibleTrigger variant="disclosure" className="group">
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="size-3.5 transition-transform duration-200 group-data-panel-open:rotate-90"
      />
      <HugeiconsIcon icon={Icon} strokeWidth={2} className="size-3.5" />
      <span className="truncate">{label}</span>
      {status}
    </CollapsibleTrigger>
    <CollapsibleContent variant="disclosure" className="mt-1 ml-1.5">
      {children}
    </CollapsibleContent>
  </Collapsible>
)
