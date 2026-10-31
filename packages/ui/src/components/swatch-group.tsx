import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { cn } from '@tamery/ui/lib/utils'

const SwatchGroup = <Value extends string>({
  className,
  ...props
}: ToggleGroupPrimitive.Props<Value>) => (
  <ToggleGroupPrimitive
    data-slot="swatch-group"
    className={cn(
      'has-aria-invalid:invalid-ring inline-flex w-fit items-center gap-2.5',
      className
    )}
    {...props}
  />
)

const SwatchGroupItem = ({
  className,
  size = 'default',
  ...props
}: TogglePrimitive.Props & { size?: 'default' | 'lg' }) => (
  <TogglePrimitive
    data-slot="swatch-group-item"
    data-size={size}
    className={cn(
      `focus-visible:focus-ring ring-offset-background data-[size=default]:data-pressed:ring-foreground/40 data-[size=lg]:data-pressed:ring-primary inline-flex items-center justify-center transition-all outline-none disabled:pointer-events-none disabled:opacity-50 data-pressed:ring-2 data-pressed:ring-offset-2 data-[size=default]:size-5 data-[size=default]:rounded-full data-[size=default]:hover:scale-110 data-[size=lg]:size-9 data-[size=lg]:overflow-hidden data-[size=lg]:rounded-[22.5%]`,
      className
    )}
    {...props}
  />
)

export { SwatchGroup, SwatchGroupItem }
