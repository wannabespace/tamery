import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'

import { Link } from '~/components/link'
import { FetchingReason } from '~/core/connection/fetching-reason'
import { useOpenConnectionId } from '~/core/connection/use-open-connection-id'
import {
  isMachine,
  parseRunsOn,
  useConnectionRunsOn,
  useMachineRouteById,
} from '~/core/runtime/machine/pairing'
import {
  getMachineStatusMessage,
  useMachineStatus,
} from '~/core/runtime/machine/status'

import { pickRunsOn, useConnectionRunsOnOptions } from './runs-on-options'

const RunsOnMenu = ({ connectionId }: { connectionId: string }) => {
  const runsOn = useConnectionRunsOn(connectionId)
  const options = useConnectionRunsOnOptions(connectionId)
  const route = useMachineRouteById(runsOn, connectionId)
  const status = useMachineStatus(route?.pairing ?? null)
  const current = options.find(({ value }) => value === runsOn)
  if (!current) {
    return null
  }
  const down =
    !!route &&
    (!route.pairing || (status !== null && status.state !== 'connected'))
  const maskedName = (
    <span data-mask={!!route || undefined}>{current.label}</span>
  )

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Runs on ${current.label}`}
                  className="relative"
                />
              }
            />
          }
        >
          <HugeiconsIcon icon={current.icon} strokeWidth={2} />
          {route && (
            <span
              className={cn(
                'ring-card absolute top-1 right-1 size-1.5 rounded-full ring-2',
                status?.state === 'connected' && 'bg-success',
                down && 'bg-destructive'
              )}
            />
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {/* Tooltip content is a flex row: one span keeps the sentence and its command on one line. */}
          <span>
            {down ? (
              <>
                {maskedName}:{' '}
                <FetchingReason
                  reason={
                    status
                      ? getMachineStatusMessage(status)
                      : 'This browser is not connected to it.'
                  }
                />
              </>
            ) : (
              <>Queries run on {maskedName}</>
            )}
          </span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuRadioGroup
          value={runsOn}
          onValueChange={(value: string) =>
            pickRunsOn(connectionId, parseRunsOn(value))
          }
        >
          <DropdownMenuLabel>Runs on</DropdownMenuLabel>
          {options.map(({ description, icon, label, value }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <HugeiconsIcon icon={icon} strokeWidth={2} />
              <span className="flex flex-col">
                <span data-mask={isMachine(value) || undefined}>{label}</span>
                <span className="text-muted-foreground text-xs">
                  {description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <Link
              to="/settings/$section"
              params={{ section: 'machines' }}
              activateOn="click"
            />
          }
        >
          Machines…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Where the open connection runs for this user; absent while there is only one place to pick. */
export const RunsOn = () => {
  const connectionId = useOpenConnectionId()
  return connectionId ? <RunsOnMenu connectionId={connectionId} /> : null
}
