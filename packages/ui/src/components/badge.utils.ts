import { cva } from 'class-variance-authority'

export const badgeVariants = cva(
  `group/badge focus-visible:focus-ring aria-invalid:invalid-ring inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent font-medium whitespace-nowrap transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!`,
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: `h-5 px-2 text-xs`,
        sm: `text-2xs h-4 px-1.5`,
      },
      variant: {
        default: `bg-primary text-primary-foreground [a]:hover:bg-primary/80`,
        destructive: `bg-destructive/15 text-destructive [a]:hover:bg-destructive/25`,
        ghost: `hover:bg-foreground/5 hover:text-muted-foreground`,
        link: `text-primary underline-offset-4 hover:underline`,
        outline: `border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground`,
        secondary: `bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80`,
        warning: `bg-warning/15 text-foreground`,
      },
    },
  }
)
