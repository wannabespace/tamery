import { ComputerIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'

import { Link } from '~/components/link'
import { FetchingReason } from '~/core/connection/fetching-reason'
import {
  getBridgeStatusMessage,
  useBridgeStatus,
} from '~/core/runtime/bridge/bridge'

export const RunsOn = () => {
  const bridge = useBridgeStatus()
  if (!bridge?.pairing.enabled) {
    return null
  }
  const { pairing, status } = bridge
  const down = status !== null && status.state !== 'connected'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Bridge on ${pairing.name}`}
            className="relative"
            render={
              <Link to="/settings/$section" params={{ section: 'bridge' }} />
            }
          />
        }
      >
        <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} />
        <span
          className={cn(
            'ring-card absolute top-1 right-1 size-1.5 rounded-full ring-2',
            status?.state === 'connected' && 'bg-success',
            down && 'bg-destructive'
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {/* Tooltip content is a flex row: one span keeps the sentence and its command on one line. */}
        <span>
          {down ? (
            <FetchingReason
              reason={getBridgeStatusMessage(status, pairing.name)}
            />
          ) : (
            <>
              Queries run on <span data-mask>{pairing.name}</span>
            </>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
