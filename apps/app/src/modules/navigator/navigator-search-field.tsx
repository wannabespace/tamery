import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import { cn } from '@tamery/ui/lib/utils'
import type { ComponentProps } from 'react'

// Keep it mounted and focusable while hidden (no conditional render, no `invisible`): it is the Navigator's keyboard home, and typing into it is what reveals it.
export const NavigatorSearchField = ({
  open,
  placeholder,
  ...props
}: Omit<ComponentProps<typeof SearchInput>, 'aria-label' | 'size' | 'start'> & {
  open: boolean
  placeholder: string
}) => (
  <div
    data-search-open={open || undefined}
    className={cn(
      'absolute top-0 right-1.5 left-2 flex h-8 items-center',
      !open && 'pointer-events-none opacity-0'
    )}
  >
    <SearchInput
      className="flex-1"
      size="sm"
      data-mask
      aria-label={placeholder}
      placeholder={placeholder}
      start={
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="text-muted-foreground/70 size-3.5"
        />
      }
      {...props}
    />
  </div>
)
