import { NavigationMenu as NavigationMenuPrimitive } from '@base-ui/react/navigation-menu'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { buttonVariants } from '@tamery/ui/components/button.utils'
import { cn } from '@tamery/ui/lib/utils'

const NavigationMenuPositioner = ({
  align = 'start',
  className,
  side = 'bottom',
  sideOffset = 10,
  ...props
}: NavigationMenuPrimitive.Positioner.Props) => (
  <NavigationMenuPrimitive.Portal>
    <NavigationMenuPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'ease-house isolate z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom] duration-300 data-instant:transition-none',
        className
      )}
      {...props}
    >
      <NavigationMenuPrimitive.Popup className="bg-popover text-popover-foreground ring-foreground/4 ease-house relative h-(--popup-height) w-(--popup-width) origin-(--transform-origin) rounded-xl shadow-xl ring transition-[opacity,scale,width,height] duration-300 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-150 data-starting-style:scale-95 data-starting-style:opacity-0">
        <NavigationMenuPrimitive.Viewport className="relative size-full overflow-hidden" />
      </NavigationMenuPrimitive.Popup>
    </NavigationMenuPrimitive.Positioner>
  </NavigationMenuPrimitive.Portal>
)

const NavigationMenu = ({
  align = 'start',
  className,
  children,
  ...props
}: NavigationMenuPrimitive.Root.Props &
  Pick<NavigationMenuPrimitive.Positioner.Props, 'align'>) => (
  <NavigationMenuPrimitive.Root
    data-slot="navigation-menu"
    className={cn('relative flex items-center', className)}
    {...props}
  >
    {children}
    <NavigationMenuPositioner align={align} />
  </NavigationMenuPrimitive.Root>
)

const NavigationMenuList = ({
  className,
  ...props
}: NavigationMenuPrimitive.List.Props) => (
  <NavigationMenuPrimitive.List
    data-slot="navigation-menu-list"
    className={cn('flex list-none items-center', className)}
    {...props}
  />
)

const NavigationMenuItem = ({
  className,
  ...props
}: NavigationMenuPrimitive.Item.Props) => (
  <NavigationMenuPrimitive.Item
    data-slot="navigation-menu-item"
    className={cn('relative', className)}
    {...props}
  />
)

const NavigationMenuTrigger = ({
  className,
  children,
  ...props
}: NavigationMenuPrimitive.Trigger.Props) => (
  <NavigationMenuPrimitive.Trigger
    data-slot="navigation-menu-trigger"
    className={cn(
      buttonVariants({ size: 'sm', variant: 'ghost-muted' }),
      'group',
      className
    )}
    {...props}
  >
    {children}
    <HugeiconsIcon
      icon={ArrowDown01Icon}
      strokeWidth={2}
      aria-hidden
      data-icon="inline-end"
      className="size-3 transition-transform duration-200 group-data-popup-open:rotate-180"
    />
  </NavigationMenuPrimitive.Trigger>
)

const NavigationMenuContent = ({
  className,
  ...props
}: NavigationMenuPrimitive.Content.Props) => (
  <NavigationMenuPrimitive.Content
    data-slot="navigation-menu-content"
    className={cn(
      `ease-house h-full w-max p-1.5 transition-[opacity,translate] duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-[activation-direction=left]:data-ending-style:translate-x-1/2 data-[activation-direction=left]:data-starting-style:-translate-x-1/2 data-[activation-direction=right]:data-ending-style:-translate-x-1/2 data-[activation-direction=right]:data-starting-style:translate-x-1/2`,
      className
    )}
    {...props}
  />
)

const NavigationMenuLink = ({
  className,
  ...props
}: NavigationMenuPrimitive.Link.Props) => (
  <NavigationMenuPrimitive.Link
    data-slot="navigation-menu-link"
    className={cn(
      'text-foreground hover:bg-accent focus-visible:bg-accent flex items-start gap-3 rounded-lg p-2.5 text-sm transition-colors outline-none',
      className
    )}
    {...props}
  />
)

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
}
