import { cva } from 'class-variance-authority'

const outline = `bg-input ring-foreground/4 hover:ring-foreground/12 aria-expanded:ring-foreground/12 hover:bg-accent aria-expanded:bg-accent aria-pressed:bg-foreground/10 shadow-xs ring`

export const buttonVariants = cva(
  `group/button focus-visible:focus-ring aria-invalid:invalid-ring inline-flex shrink-0 cursor-default items-center justify-center rounded-xl border border-transparent text-sm whitespace-nowrap transition-[transform,box-shadow,color,background-color,border-color] outline-none select-none not-aria-[haspopup]:active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: `h-(--button-size) gap-1.5 px-3 [--button-size:--spacing(8)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&>[data-slot=kbd]]:-ml-0.5`,
        icon: `size-(--button-size) [--button-size:--spacing(8)]`,
        'icon-2xs': `size-(--button-size) rounded-sm [--button-size:--spacing(5)] [&_svg:not([class*='size-'])]:size-3.5`,
        'icon-lg': `size-(--button-size) [--button-size:--spacing(9)]`,
        'icon-sm': `size-(--button-size) rounded-lg [--button-size:--spacing(7)]`,
        'icon-xs': `size-(--button-size) rounded-md [--button-size:--spacing(6)] [&_svg:not([class*='size-'])]:size-3.5`,
        lg: `h-(--button-size) gap-1.5 px-4 [--button-size:--spacing(9)] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&>[data-slot=kbd]]:-ml-0.5`,
        sm: `h-(--button-size) gap-1 rounded-lg px-3 [--button-size:--spacing(7)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2`,
        xs: `h-(--button-size) gap-1 rounded-md px-2.5 text-xs [--button-size:--spacing(6)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3`,
      },
      variant: {
        default: `bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary),var(--foreground)_12%)]`,
        destructive: `bg-destructive text-white shadow-xs hover:bg-[color-mix(in_oklab,var(--destructive),var(--foreground)_12%)]`,
        ghost: `[a]:text-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground transition-transform`,
        'ghost-destructive': `text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-transform`,
        'ghost-faint': `hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/5 aria-expanded:text-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground transition-transform`,
        'ghost-faint-muted': `text-muted-foreground hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/5 aria-expanded:text-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground transition-transform`,
        'ghost-muted': `text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground transition-transform`,
        heading: `text-foreground hover:text-foreground/70 aria-expanded:text-foreground/70 px-0 font-semibold transition-transform`,
        'ghost-tint': `hover:bg-foreground/10 hover:text-foreground aria-expanded:bg-foreground/10 aria-expanded:text-foreground transition-transform`,
        'ghost-tint-muted': `text-muted-foreground hover:bg-foreground/10 hover:text-foreground aria-expanded:bg-foreground/10 aria-expanded:text-foreground transition-transform`,
        link: `text-primary px-0 underline-offset-4 hover:underline`,
        'link-muted': `text-muted-foreground px-0 underline-offset-4 hover:underline`,
        outline: `text-foreground ${outline}`,
        'outline-muted': `text-muted-foreground hover:text-foreground ${outline}`,
        secondary: `bg-secondary text-secondary-foreground aria-expanded:bg-secondary aria-expanded:text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]`,
        warning: `bg-warning hover:bg-warning/85 text-white shadow-xs`,
      },
    },
  }
)
