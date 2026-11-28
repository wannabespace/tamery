import type * as React from 'react'

/** The level-3 surface every tool result and decision sits on in an answer; it rules its own sections apart. */
export const ToolCard = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-popover ring-foreground/4 flex flex-col divide-y overflow-hidden rounded-xl shadow-xs ring [--grid-surface:var(--popover)]">
    {children}
  </div>
)

export const ToolCardHeader = ({
  actions,
  icon,
  status,
  title,
}: {
  actions?: React.ReactNode
  icon: React.ReactNode
  status?: React.ReactNode
  title: React.ReactNode
}) => (
  <div className="flex h-9 items-center gap-2 pr-1.5 pl-3 text-xs">
    <span className="text-muted-foreground flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5">
      {icon}
    </span>
    <span className="min-w-0 truncate font-medium">{title}</span>
    <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1.5 pr-1.5 tabular-nums">
      {status}
    </span>
    {actions && <div className="flex shrink-0 items-center">{actions}</div>}
  </div>
)
