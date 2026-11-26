import { cva } from 'class-variance-authority'

export const cardClass =
  'bg-popover ring-foreground/4 rounded-xl shadow-xs ring'

/** A level-2 card on a level-1 pane, like a chat answer's result or decision: the canvas colour under the hairline, no shadow. `flush` leaves the edges to content that runs to them, such as a grid. */
export const insetCardVariants = cva(
  'bg-background ring-foreground/4 rounded-xl ring',
  {
    defaultVariants: { size: 'default' },
    variants: { size: { default: 'p-2', flush: '' } },
  }
)
