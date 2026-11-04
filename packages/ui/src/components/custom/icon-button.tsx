import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ComponentProps, ReactNode } from 'react'

import { Button } from '../button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip'

export const IconButton = ({
  icon,
  iconClassName,
  label,
  shortcut,
  side,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  icon: IconSvgElement
  iconClassName?: string
  label: string
  shortcut?: ReactNode
  side?: ComponentProps<typeof TooltipContent>['side']
}) => (
  <Tooltip shortcut={shortcut}>
    <TooltipTrigger render={<Button aria-label={label} {...props} />}>
      <HugeiconsIcon icon={icon} strokeWidth={2} className={iconClassName} />
    </TooltipTrigger>
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>
)
