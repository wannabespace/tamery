import { ComputerIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useParams } from '@tanstack/react-router'

import { Link } from '~/components/link'
import { useCollections } from '~/core/collections'
import { FetchingReason } from '~/core/connection/fetching-reason'
import { useMachineRoute } from '~/core/runtime/machine/pairing'
import {
  getMachineStatusMessage,
  useMachineStatus,
} from '~/core/runtime/machine/status'

/** The open connection's machine; absent where it runs here, since there is only one place to show. */
export const RunsOn = () => {
  const { resourceId } = useParams({ strict: false })
  const { connectionsResourcesCollection } = useCollections()
  const { data: resource } = useLiveQuery(
    (q) =>
      resourceId
        ? q
            .from({ r: connectionsResourcesCollection })
            .where(({ r }) => eq(r.id, resourceId))
            .findOne()
        : null,
    [resourceId]
  )
  const route = useMachineRoute(resource?.connectionId ?? null)
  const status = useMachineStatus(route?.pairing ?? null)
  if (!route) {
    return null
  }
  const down =
    !route.pairing || (status !== null && status.state !== 'connected')

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Runs on ${route.name}`}
            className="relative"
            render={
              <Link to="/settings/$section" params={{ section: 'machines' }} />
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
              reason={
                status
                  ? getMachineStatusMessage(status, route.name)
                  : `Runs on ${route.name}, which this browser is not connected to.`
              }
            />
          ) : (
            <>
              Queries run on <span data-mask>{route.name}</span>
            </>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
