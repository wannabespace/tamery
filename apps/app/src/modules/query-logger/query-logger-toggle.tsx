import { File01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarMenuButton } from '@tamery/ui/components/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useSubscription } from 'seitu/react'

import { useConnectionParams } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'

import { loggerOpen, toggleLogger } from './logger-open'

export const QueryLoggerToggle = () => {
  const { resourceId } = useConnectionParams()
  const loggerOpened = useSubscription(loggerOpen(resourceId))

  return (
    <Tooltip shortcut={<ShortcutKbd shortcut="queryLogger" />}>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            aria-pressed={loggerOpened}
            onClick={() => toggleLogger(resourceId)}
          />
        }
      >
        <HugeiconsIcon
          icon={File01Icon}
          strokeWidth={2}
          className="text-muted-foreground"
        />
        Query logger
      </TooltipTrigger>
      <TooltipContent side="right">Toggle query logger</TooltipContent>
    </Tooltip>
  )
}
