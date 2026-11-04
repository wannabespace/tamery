import { cn } from '@tamery/ui/lib/utils'

export const NameGlyph = ({
  name,
  size = 'sm',
}: {
  name: string
  size?: 'sm' | 'lg'
}) => (
  <span
    aria-hidden
    data-mask
    className={cn(
      'bg-muted text-accent-foreground flex shrink-0 items-center justify-center font-medium',
      size === 'sm' ? 'text-2xs size-4 rounded' : 'size-8 rounded-lg text-sm'
    )}
  >
    {[...name][0]?.toUpperCase() ?? ''}
  </span>
)
