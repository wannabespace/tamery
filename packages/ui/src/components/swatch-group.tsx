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
  variant = 'color',
  ...props
}: TogglePrimitive.Props & { variant?: 'color' | 'picture' }) => (
  <TogglePrimitive
    data-slot="swatch-group-item"
    data-variant={variant}
    className={cn(
      `focus-visible:focus-ring ring-offset-background data-[variant=color]:data-pressed:ring-foreground/40 data-[variant=picture]:data-pressed:ring-primary inline-flex items-center justify-center transition-all outline-none disabled:pointer-events-none disabled:opacity-50 data-pressed:ring-2 data-pressed:ring-offset-2 data-[variant=color]:size-5 data-[variant=color]:rounded-full data-[variant=color]:hover:scale-110 data-[variant=picture]:size-9 data-[variant=picture]:overflow-hidden data-[variant=picture]:rounded-[22.5%]`,
      className
    )}
    {...props}
  />
)

export { SwatchGroup, SwatchGroupItem }
