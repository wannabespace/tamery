import { Grid3X2Icon, ListViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useSubscription } from 'seitu/react'

import { useTabParams } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { focusGridWhenReady } from '~/core/table/pending-grid-focus'
import { posthog } from '~/lib/posthog'

import { useTablePageStore } from '../../../lib/store'

export const ActionsView = () => {
  const { tabId } = useTabParams()
  const store = useTablePageStore()
  const view = useSubscription(store, { selector: (state) => state.view })
  const label = view === 'grid' ? 'Show as documents' : 'Show as grid'
  const toggle = () => {
    const next = view === 'grid' ? 'documents' : 'grid'
    if (document.activeElement?.closest('[role=grid]')) {
      focusGridWhenReady(tabId)
    }
    store.set((state) => ({ ...state, view: next }))
    posthog.capture('table_view_toggled', { view: next })
  }

  useShortcut('toggleView', toggle)

  return (
    <Tooltip shortcut={<ShortcutKbd shortcut="toggleView" />}>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={label}
            onClick={toggle}
          />
        }
      >
        <HugeiconsIcon
          icon={view === 'grid' ? ListViewIcon : Grid3X2Icon}
          strokeWidth={2}
          className="text-muted-foreground/60"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
