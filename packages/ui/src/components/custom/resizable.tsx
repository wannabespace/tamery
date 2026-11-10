import { cn } from '@tamery/ui/lib/utils'
import { Group, Panel, Pin, Separator } from 'motion-panels/react'
import type { ComponentProps } from 'react'

export const ResizableGroup = (props: ComponentProps<typeof Group>) => (
  <Group data-slot="resizable-group" {...props} />
)

export const ResizablePanel = (props: ComponentProps<typeof Panel>) => (
  <Panel
    data-slot="resizable-panel"
    inert={'collapsed' in props && props.collapsed}
    {...props}
  />
)

export const ResizablePin = (props: ComponentProps<typeof Pin>) => (
  <Pin data-slot="resizable-pin" {...props} />
)

export const ResizableSeparator = ({
  className,
  ...props
}: ComponentProps<typeof Separator>) => (
  <Separator
    data-slot="resizable-separator"
    tabIndex={-1}
    className={cn(
      `group/resizable-separator hit-area-1 z-30 flex items-center justify-center outline-hidden aria-[orientation=horizontal]:h-1 aria-[orientation=vertical]:w-1`,
      className
    )}
    {...props}
  >
    <div className="via-primary rounded-xs from-transparent to-transparent opacity-0 transition-opacity group-hover/resizable-separator:opacity-40 group-focus-visible/resizable-separator:opacity-40 group-active/resizable-separator:opacity-100 group-aria-[orientation=horizontal]/resizable-separator:h-[2px] group-aria-[orientation=horizontal]/resizable-separator:w-full group-aria-[orientation=horizontal]/resizable-separator:bg-linear-to-r group-aria-[orientation=vertical]/resizable-separator:h-full group-aria-[orientation=vertical]/resizable-separator:w-[2px] group-aria-[orientation=vertical]/resizable-separator:bg-linear-to-b group-data-crossing/resizable-separator:opacity-40 group-data-resizing/resizable-separator:opacity-100" />
  </Separator>
)
