import { Globe02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useLocation } from '@tanstack/react-router'

import { useIsReachableFromWeb } from '~/core/connection/fetching'
import { useOpenConnectionId } from '~/core/connection/use-open-connection-id'

export const OpenInWeb = () => {
  const location = useLocation()
  const isReachable = useIsReachableFromWeb(useOpenConnectionId())

  if (!window.electron || !isReachable) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Open in web app"
            onClick={() =>
              window.open(import.meta.env.VITE_PUBLIC_WEB_URL + location.href)
            }
          />
        }
      >
        <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">Open in web app</TooltipContent>
    </Tooltip>
  )
}
