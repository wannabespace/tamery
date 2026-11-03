import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

import { WindowButtons } from './window-buttons'

export const TerminalWindow = ({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title: string
}) => (
  <div
    className={cn(
      'bg-background ring-foreground/4 absolute top-0 left-0 flex w-full flex-col overflow-hidden rounded-xl shadow-xl ring',
      className
    )}
  >
    <div className="relative flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <WindowButtons muted />
      <span className="text-muted-foreground absolute inset-x-0 text-center text-xs">
        {title}
      </span>
    </div>
    <div className="flex min-h-72 flex-col gap-3 p-4 font-mono text-xs/5">
      {children}
    </div>
  </div>
)
