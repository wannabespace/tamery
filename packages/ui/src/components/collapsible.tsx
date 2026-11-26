import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'
import { cn } from '@tamery/ui/lib/utils'

const Collapsible = ({ ...props }: CollapsiblePrimitive.Root.Props) => (
  <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
)

const CollapsibleTrigger = ({
  className,
  variant,
  ...props
}: CollapsiblePrimitive.Trigger.Props & { variant?: 'disclosure' }) => (
  <CollapsiblePrimitive.Trigger
    data-slot="collapsible-trigger"
    className={cn(
      variant === 'disclosure' &&
        'text-muted-foreground hover:text-foreground flex h-5 items-center gap-1.5 text-xs transition-colors',
      className
    )}
    {...props}
  />
)

const CollapsibleContent = ({
  className,
  variant,
  ...props
}: CollapsiblePrimitive.Panel.Props & { variant?: 'disclosure' }) => (
  <CollapsiblePrimitive.Panel
    data-slot="collapsible-content"
    className={cn(variant === 'disclosure' && 'border-l pl-3', className)}
    {...props}
  />
)

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
