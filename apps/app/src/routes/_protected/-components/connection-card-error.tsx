import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'

import { useDiagnosis } from '~/core/connection/diagnosis'

export const ConnectionCardError = ({
  connectionId,
  error,
}: {
  connectionId: string
  error: Error
}) => {
  const diagnosis = useDiagnosis(connectionId, error)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="text-warning pointer-events-auto size-3 shrink-0"
          />
        }
      />
      <TooltipContent className="pointer-events-auto block max-w-3xs">
        {diagnosis && (
          <>
            <span data-mask className="block">
              {diagnosis.title}
            </span>
            <span data-mask className="opacity-50">
              {diagnosis.hint}
            </span>
          </>
        )}
        {diagnosis === null && (
          <>
            <span className="opacity-50">Failed to get resources: </span>
            <span data-mask>{error.message}</span>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
