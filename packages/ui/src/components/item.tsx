import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { Separator } from '@tamery/ui/components/separator'
import { cn } from '@tamery/ui/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'
import * as React from 'react'

const ItemGroup = ({ className, ...props }: React.ComponentProps<'ul'>) => (
  <ul
    data-slot="item-group"
    className={cn(
      `group/item-group m-0 flex w-full list-none flex-col gap-4 p-0 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2`,
      className
    )}
    {...props}
  />
)

const ItemSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) => (
  <Separator
    data-slot="item-separator"
    orientation="horizontal"
    className={cn('my-2', className)}
    {...props}
  />
)

const smallItemInsetClassName = 'px-3.5'

const itemVariants = cva(
  `group/item focus-visible:focus-ring [a]:hover:bg-accent [a]:text-foreground flex w-full flex-wrap items-center rounded-2xl border text-sm transition-colors duration-100 outline-none [a]:transition-colors`,
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'gap-3.5 px-4 py-3.5',
        sm: `gap-3.5 ${smallItemInsetClassName} py-3`,
        xs: `gap-2 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0`,
      },
      variant: {
        card: `bg-popover ring-foreground/4 [a]:hover:ring-foreground/12 rounded-xl border-transparent shadow-xs ring [a]:transition-[color,background-color,box-shadow]`,
        default: 'border-transparent',
        grouped: `border-foreground/6 rounded-none border-0 border-b last:border-b-0`,
        muted: 'bg-muted/50 border-transparent',
        outline: 'border-border',
      },
    },
  }
)

const Item = ({
  className,
  variant = 'default',
  size = 'default',
  render,
  ...props
}: useRender.ComponentProps<'div'> & VariantProps<typeof itemVariants>) =>
  useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(
      {
        className: cn(itemVariants({ className, size, variant })),
      },
      props
    ),
    render,
    state: {
      size,
      slot: 'item',
      variant,
    },
  })

const itemMediaVariants = cva(
  `flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none`,
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        avatar: `group-has-data-[slot=item-description]/item:translate-y-0 group-has-data-[slot=item-description]/item:self-center`,
        default: 'bg-transparent',
        icon: "[&_svg:not([class*='size-'])]:size-4",
        image: `size-10 overflow-hidden rounded-xl group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 group-data-[size=xs]/item:rounded-lg [&_img]:size-full [&_img]:object-cover`,
      },
    },
  }
)

const ItemMedia = ({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof itemMediaVariants>) => (
  <div
    data-slot="item-media"
    data-variant={variant}
    className={cn(itemMediaVariants({ className, variant }))}
    {...props}
  />
)

const ItemContent = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="item-content"
    className={cn(
      `flex flex-1 flex-col gap-1 group-data-[size=sm]/item:gap-0 group-data-[size=xs]/item:gap-0.5 [&+[data-slot=item-content]]:flex-none`,
      className
    )}
    {...props}
  />
)

const ItemTitle = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="item-title"
    className={cn(
      `flex w-fit items-center gap-2 overflow-hidden text-sm/snug font-medium underline-offset-4`,
      className
    )}
    {...props}
  />
)

const ItemDescription = ({
  className,
  ...props
}: React.ComponentProps<'p'>) => (
  <p
    data-slot="item-description"
    className={cn(
      `text-muted-foreground [&>a:hover]:text-primary line-clamp-2 text-left text-sm font-normal [&>a]:underline [&>a]:underline-offset-4`,
      className
    )}
    {...props}
  />
)

const ItemActions = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="item-actions"
    className={cn('flex items-center gap-2', className)}
    {...props}
  />
)

const ItemHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="item-header"
    className={cn(
      'flex basis-full items-center justify-between gap-2',
      className
    )}
    {...props}
  />
)

const ItemFooter = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="item-footer"
    className={cn(
      'flex basis-full items-center justify-between gap-2',
      className
    )}
    {...props}
  />
)

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  smallItemInsetClassName,
}
