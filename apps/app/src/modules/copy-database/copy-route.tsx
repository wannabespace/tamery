import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { Progress } from '@tamery/ui/components/progress'
import type { ComponentProps } from 'react'

import { ResourceLabel } from '~/core/connection/resource-label'

import type { CopyEnd } from './copy-end-label'
import { ConnectionNameLabel } from './copy-end-label'
import type { CopyStatus } from './copy-progress'

const PROGRESS = {
  copied: { value: 100, variant: 'success' },
  copying: { value: null, variant: 'default' },
  failed: { value: 100, variant: 'destructive' },
  stopped: { value: 0, variant: 'default' },
} as const satisfies Record<CopyStatus, ComponentProps<typeof Progress>>

const RouteEnd = ({ connection, resource }: CopyEnd) => (
  <span
    data-mask
    className="bg-popover ring-foreground/4 flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 ring"
  >
    <ConnectionIcon
      type={connection.type}
      provider={connection.provider}
      className="size-5 shrink-0"
    />
    <span className="flex min-w-0 flex-col">
      <span className="text-foreground truncate font-medium">
        <ConnectionNameLabel connection={connection} />
      </span>
      <span className="truncate text-xs">
        <ResourceLabel connection={connection} name={resource.name} />
      </span>
    </span>
  </span>
)

export const CopyRoute = ({
  source,
  status,
  target,
}: {
  source: CopyEnd
  status: CopyStatus
  target: CopyEnd
}) => (
  <span className="mt-3 flex flex-col gap-4">
    <span className="flex items-center gap-2">
      <RouteEnd {...source} />
      <HugeiconsIcon
        icon={ArrowRight02Icon}
        strokeWidth={2}
        className="text-muted-foreground size-4 shrink-0"
      />
      <RouteEnd {...target} />
    </span>
    <Progress aria-label="Copy progress" {...PROGRESS[status]} />
  </span>
)
