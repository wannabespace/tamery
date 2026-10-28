import { Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'

import { Link } from '~/components/link'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'

export const SettingsButton = () => (
  <Tooltip shortcut={<ShortcutKbd shortcut="settings" />}>
    <TooltipTrigger
      render={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Settings"
          render={<Link to="/settings" />}
        />
      }
    >
      <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-4" />
    </TooltipTrigger>
    <TooltipContent side="bottom">Settings</TooltipContent>
  </Tooltip>
)
