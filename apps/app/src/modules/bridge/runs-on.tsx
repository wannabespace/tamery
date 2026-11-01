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

/** Where the tab's queries run, beside Run: a paired browser sends them to its bridge, never silently to the cloud. */
export const RunsOn = () => {
  const bridge = useBridgeStatus()
  if (!bridge) {
    return null
  }
  const { pairing, status } = bridge

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost-muted"
            size="sm"
            render={
              <Link to="/settings/$section" params={{ section: 'bridge' }} />
            }
          />
        }
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            status?.state === 'connected' && 'bg-success',
            status && status.state !== 'connected' && 'bg-destructive'
          )}
        />
        <span>
          Runs on <span data-mask>{pairing.name}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {status && status.state !== 'connected' ? (
          <FetchingReason
            reason={getBridgeStatusMessage(status, pairing.name)}
          />
        ) : (
          'Bridge settings'
        )}
      </TooltipContent>
    </Tooltip>
  )
}
