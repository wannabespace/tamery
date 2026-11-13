import { cn } from '@tamery/ui/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'
import type * as React from 'react'

const Empty = ({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) => (
  <div
    data-slot="empty"
    data-size={size}
    className={cn(
      `group/empty flex min-w-0 flex-1 flex-col items-center justify-center-safe gap-6 rounded-lg border-dashed text-center text-balance`,
      size === 'default' ? 'p-6 md:p-12' : 'p-4',
      className
    )}
    {...props}
  />
)

const EmptyHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="empty-header"
    className={cn(
      'flex max-w-sm flex-col items-center gap-2 text-center group-data-[size=sm]/empty:gap-1',
      className
    )}
    {...props}
  />
)

const emptyMediaVariants = cva(
  `mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0`,
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-transparent',
        elevated: `bg-input ring-foreground/4 text-muted-foreground mb-3 flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-xs ring [&_svg:not([class*='size-'])]:size-6`,
        destructive: `bg-destructive/10 text-destructive mb-3 flex size-14 shrink-0 items-center justify-center rounded-2xl [&_svg:not([class*='size-'])]:size-6`,
        icon: `bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6`,
        muted: `bg-muted/60 text-muted-foreground/70 mb-3 flex size-14 shrink-0 items-center justify-center rounded-2xl [&_svg:not([class*='size-'])]:size-6`,
      },
    },
  }
)

const EmptyMedia = ({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>) => (
  <div
    data-slot="empty-icon"
    data-variant={variant}
    className={cn(emptyMediaVariants({ className, variant }))}
    {...props}
  />
)

const EmptyTitle = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="empty-title"
    className={cn(
      'text-lg font-medium tracking-tight group-data-[size=sm]/empty:text-sm group-data-[size=sm]/empty:tracking-normal',
      className
    )}
    {...props}
  />
)

const EmptyDescription = ({
  className,
  ...props
}: React.ComponentProps<'p'>) => (
  <div
    data-slot="empty-description"
    className={cn(
      `text-muted-foreground [&>a:hover]:text-primary text-sm/relaxed group-data-[size=sm]/empty:text-xs [&>a]:underline [&>a]:underline-offset-4`,
      className
    )}
    {...props}
  />
)

const EmptyContent = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="empty-content"
    className={cn(
      `flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance group-data-[size=sm]/empty:gap-2`,
      className
    )}
    {...props}
  />
)

export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
}
