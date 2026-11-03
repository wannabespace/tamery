import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'

import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'

import { actionCenterOpen } from './action-center-open'

/** Reads as a search field, like a search box in a native title bar; below `md` it folds to its icon. */
export const CommandPaletteButton = () => (
  <Button
    size="sm"
    variant="outline-muted"
    aria-label="Search"
    className="md:w-48 md:justify-start"
    onClick={() => actionCenterOpen.set(true)}
  >
    <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
    <span className="hidden flex-1 text-left md:inline">Search</span>
    <span className="hidden md:inline-flex">
      <ShortcutKbd shortcut="commandPalette" />
    </span>
  </Button>
)
