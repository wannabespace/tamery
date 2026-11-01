import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu'
import { ArrowRight01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@tamery/ui/lib/utils'
import * as React from 'react'

const ContextMenu = ({ ...props }: ContextMenuPrimitive.Root.Props) => (
  <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
)

const ContextMenuPortal = ({ ...props }: ContextMenuPrimitive.Portal.Props) => (
  <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
)

const ContextMenuTrigger = ({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props) => (
  <ContextMenuPrimitive.Trigger
    data-slot="context-menu-trigger"
    className={cn('select-none', className)}
    {...props}
  />
)

const ContextMenuContent = ({
  className,
  align = 'start',
  alignOffset = 4,
  side = 'right',
  sideOffset = 0,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Positioner
      className="isolate z-50 outline-none"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
    >
      <ContextMenuPrimitive.Popup
        data-slot="context-menu-content"
        className={cn(
          `bg-popover text-popover-foreground ring-foreground/4 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl p-1 shadow-xl ring ease-[cubic-bezier(0.32,0.72,0,1)] outline-none data-closed:duration-100 data-open:duration-150`,
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Positioner>
  </ContextMenuPrimitive.Portal>
)

const ContextMenuGroup = ({ ...props }: ContextMenuPrimitive.Group.Props) => (
  <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
)

const ContextMenuLabel = ({
  className,
  inset,
  ...props
}: ContextMenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) => (
  <ContextMenuPrimitive.GroupLabel
    data-slot="context-menu-label"
    data-inset={inset}
    className={cn(
      `text-muted-foreground px-2 py-1 text-xs data-inset:pl-7`,
      className
    )}
    {...props}
  />
)

const ContextMenuItem = ({
  className,
  inset,
  variant = 'default',
  ...props
}: ContextMenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) => (
  <ContextMenuPrimitive.Item
    data-slot="context-menu-item"
    data-inset={inset}
    data-variant={variant}
    className={cn(
      `group/context-menu-item focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/15 data-[variant=destructive]:focus:text-destructive *:[svg]:text-foreground/70 focus:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive font-row relative flex min-h-7 cursor-default items-center gap-2 rounded-lg px-2 py-1 text-sm tracking-wide outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
      className
    )}
    {...props}
  />
)

const ContextMenuSub = ({
  ...props
}: ContextMenuPrimitive.SubmenuRoot.Props) => (
  <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
)

const ContextMenuSubTrigger = ({
  className,
  inset,
  children,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) => (
  <ContextMenuPrimitive.SubmenuTrigger
    data-slot="context-menu-sub-trigger"
    data-inset={inset}
    className={cn(
      `focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground *:[svg]:text-foreground/70 focus:*:[svg]:text-accent-foreground data-open:*:[svg]:text-accent-foreground font-row flex min-h-7 cursor-default items-center gap-2 rounded-lg px-2 py-1 text-sm tracking-wide outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
      className
    )}
    {...props}
  >
    {children}
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      strokeWidth={2}
      className="ml-auto size-3.5"
    />
  </ContextMenuPrimitive.SubmenuTrigger>
)

const ContextMenuSubContent = ({
  ...props
}: React.ComponentProps<typeof ContextMenuContent>) => (
  <ContextMenuContent
    data-slot="context-menu-sub-content"
    side="right"
    {...props}
  />
)

const ContextMenuCheckboxItem = ({
  className,
  children,
  checked,
  inset,
  ...props
}: ContextMenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) => (
  <ContextMenuPrimitive.CheckboxItem
    data-slot="context-menu-checkbox-item"
    data-inset={inset}
    className={cn(
      `focus:bg-accent focus:text-accent-foreground *:[svg]:text-foreground/70 focus:*:[svg]:text-accent-foreground font-row relative flex min-h-7 cursor-default items-center gap-2 rounded-lg py-1 pr-8 pl-2 text-sm tracking-wide outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="pointer-events-none absolute right-2">
      <ContextMenuPrimitive.CheckboxItemIndicator>
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
      </ContextMenuPrimitive.CheckboxItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
)

const ContextMenuRadioGroup = ({
  ...props
}: ContextMenuPrimitive.RadioGroup.Props) => (
  <ContextMenuPrimitive.RadioGroup
    data-slot="context-menu-radio-group"
    {...props}
  />
)

const ContextMenuRadioItem = ({
  className,
  children,
  inset,
  ...props
}: ContextMenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) => (
  <ContextMenuPrimitive.RadioItem
    data-slot="context-menu-radio-item"
    data-inset={inset}
    className={cn(
      `focus:bg-accent focus:text-accent-foreground *:[svg]:text-foreground/70 focus:*:[svg]:text-accent-foreground font-row relative flex min-h-7 cursor-default items-center gap-2 rounded-lg py-1 pr-8 pl-2 text-sm tracking-wide outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
      className
    )}
    {...props}
  >
    <span className="pointer-events-none absolute right-2">
      <ContextMenuPrimitive.RadioItemIndicator>
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
      </ContextMenuPrimitive.RadioItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
)

const ContextMenuSeparator = ({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) => (
  <ContextMenuPrimitive.Separator
    data-slot="context-menu-separator"
    className={cn('bg-border/50 -mx-1.5 my-1 h-px', className)}
    {...props}
  />
)

const ContextMenuShortcut = ({
  className,
  ...props
}: React.ComponentProps<'span'>) => (
  <span
    data-slot="context-menu-shortcut"
    className={cn(
      `text-muted-foreground group-focus/context-menu-item:text-accent-foreground ml-auto inline-flex items-center text-xs tracking-widest`,
      className
    )}
    {...props}
  />
)

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
}
