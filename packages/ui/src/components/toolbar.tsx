import { Toolbar as ToolbarPrimitive } from '@base-ui/react/toolbar'
import { cn } from '@tamery/ui/lib/utils'

/** A row or column of controls that is one Tab stop: the arrows move between them. */
const Toolbar = ({ className, ...props }: ToolbarPrimitive.Root.Props) => (
  <ToolbarPrimitive.Root
    data-slot="toolbar"
    className={cn('flex gap-1 data-[orientation=vertical]:flex-col', className)}
    {...props}
  />
)

const ToolbarButton = (props: ToolbarPrimitive.Button.Props) => (
  <ToolbarPrimitive.Button data-slot="toolbar-button" {...props} />
)

export { Toolbar, ToolbarButton }
