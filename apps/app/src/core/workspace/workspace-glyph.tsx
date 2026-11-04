import { cn } from '@tamery/ui/lib/utils'

import type { Workspace } from './sync'

export const WorkspaceGlyph = ({
  className,
  workspace,
}: {
  className?: string
  workspace: Pick<Workspace, 'name'>
}) => (
  <span
    aria-hidden
    data-mask
    className={cn(
      'bg-muted text-2xs text-accent-foreground flex size-4 shrink-0 items-center justify-center rounded font-medium',
      className
    )}
  >
    {[...workspace.name][0]?.toUpperCase() ?? ''}
  </span>
)
