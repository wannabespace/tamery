import { cva } from 'class-variance-authority'

const inputGroupSurface = `bg-input ring-foreground/4 hover:ring-foreground/12 has-[[data-slot=input-group-control]:focus-visible]:focus-ring has-[[data-slot][aria-invalid=true]]:invalid-ring rounded-xl border border-transparent shadow-xs [--input-group-border:var(--default-border-width)] ring focus-within:in-data-[slot=combobox-content]:border-inherit in-data-[slot=combobox-content]:ring-0! data-[size=sm]:rounded-lg data-[size=xs]:rounded-md`

export const inputGroupVariants = cva(
  `group/input-group relative flex h-(--input-group-h) w-full min-w-0 items-center transition-shadow duration-200 outline-none [--input-group-h:--spacing(8)] has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto data-[size=sm]:[--input-group-h:--spacing(7)] data-[size=xs]:[--input-group-h:--spacing(6)] data-[size=sm]:*:data-[slot=input-group-control]:h-7 data-[size=sm]:*:data-[slot=input-group-control]:text-sm data-[size=xs]:*:data-[slot=input-group-control]:h-6 data-[size=xs]:*:data-[slot=input-group-control]:text-xs has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5`,
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: inputGroupSurface,
        flat: `has-[[data-slot=input-group-control]:focus-visible]:focus-ring has-[[data-slot][aria-invalid=true]]:invalid-ring bg-transparent first:rounded-t-xl last:rounded-b-xl`,
        floating: `${inputGroupSurface} shadow-md`,
        inset: `has-[[data-slot=input-group-control]:focus-visible]:focus-ring has-[[data-slot][aria-invalid=true]]:invalid-ring rounded-xl bg-transparent`,
      },
    },
  }
)

export const inputGroupAddonVariants = cva(
  `text-muted-foreground flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm select-none group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-4`,
  {
    defaultVariants: {
      align: 'inline-start',
    },
    variants: {
      align: {
        'block-end': `order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2`,
        'block-start': `order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2`,
        'inline-end': `order-last pr-2.5 has-[>button:last-child]:pr-0 [&>button:last-child]:mr-[calc((var(--input-group-h)-var(--button-size))/2-var(--input-group-border,0px))]`,
        'inline-start': `order-first pl-2.5 has-[>button:first-child]:pl-0 [&>button:first-child]:ml-[calc((var(--input-group-h)-var(--button-size))/2-var(--input-group-border,0px))]`,
      },
    },
  }
)

export const inputGroupButtonVariants = cva(
  'flex items-center gap-2 rounded-lg text-sm shadow-none',
  {
    defaultVariants: {
      size: 'xs',
    },
    variants: {
      size: {
        'icon-round': `size-(--button-size) rounded-full p-0 [--button-size:--spacing(6)] has-[>svg]:p-0 [&_svg:not([class*='size-'])]:size-3.5`,
        'icon-sm': `size-(--button-size) p-0 [--button-size:--spacing(8)] has-[>svg]:p-0`,
        'icon-xs': `size-(--button-size) rounded-md p-0 [--button-size:--spacing(6)] has-[>svg]:p-0 [&_svg:not([class*='size-'])]:size-3.5`,
        sm: '',
        xs: `h-(--button-size) gap-1 rounded-md px-1.5 [--button-size:--spacing(6)] [&>svg:not([class*='size-'])]:size-3.5`,
      },
    },
  }
)
