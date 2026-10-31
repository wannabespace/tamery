import { DatabaseIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'

import { Link } from '~/components/link'
import { useIsViewOnlyWorkspace } from '~/core/workspace/hooks'
import { VIEW_ONLY_MESSAGE } from '~/core/workspace/utils'

const GhostRow = ({
  nameWidth,
  urlWidth,
  lit = false,
  className,
}: {
  nameWidth: string
  urlWidth: string
  lit?: boolean
  className?: string
}) => (
  <div
    className={cn(
      'border-border/40 flex h-9 items-center gap-3 border-b px-3 last:border-b-0',
      className
    )}
  >
    <span
      className={cn(
        'h-4 w-0.5 shrink-0 rounded-full',
        lit ? 'bg-primary' : 'bg-muted-foreground/20'
      )}
    />
    <span className="bg-muted-foreground/15 size-4 shrink-0 rounded-md" />
    <span
      className={cn('bg-muted-foreground/15 h-2.5 rounded-full', nameWidth)}
    />
    <span className="flex-1" />
    <span
      className={cn(
        `bg-muted-foreground/10 hidden h-2 rounded-full md:block`,
        urlWidth
      )}
    />
  </div>
)

export const Empty = () => (
  <div className="flex flex-col items-center py-10 text-center">
    <div
      className="border-border/50 bg-card/40 pointer-events-none w-full max-w-md overflow-hidden rounded-xl border mask-b-from-0%"
      aria-hidden
    >
      <GhostRow nameWidth="w-32" urlWidth="w-28" lit />
      <GhostRow nameWidth="w-24" urlWidth="w-36" className="opacity-70" />
      <GhostRow nameWidth="w-36" urlWidth="w-24" className="opacity-40" />
    </div>

    <div className="border-border/50 bg-card -mt-6 flex size-12 items-center justify-center rounded-xl border shadow-xs">
      <HugeiconsIcon
        icon={DatabaseIcon}
        strokeWidth={2}
        className="text-muted-foreground size-5"
      />
    </div>

    <h2 className="text-foreground mt-5 text-base font-medium">
      No connections yet
    </h2>
    <p className="text-muted-foreground mt-1 max-w-xs text-sm">
      Add a connection and it shows up here — open it in one click.
    </p>

    <NewConnectionButton />
  </div>
)

const NewConnectionButton = () => {
  const viewOnly = useIsViewOnlyWorkspace()

  return (
    <Tooltip disabled={!viewOnly}>
      <TooltipTrigger
        render={
          <Button
            className="mt-5"
            disabled={viewOnly}
            focusableWhenDisabled
            render={viewOnly ? undefined : <Link to="/create" />}
          />
        }
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-4" />
        New connection
      </TooltipTrigger>
      <TooltipContent>{VIEW_ONLY_MESSAGE}</TooltipContent>
    </Tooltip>
  )
}
