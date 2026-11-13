import { HistoryIcon } from '@hugeicons/core-free-icons'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { useSubscription } from 'seitu/react'

import { useConnectionParams } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'

import { loggerOpen, toggleLogger } from './logger-open'

export const QueryLoggerToggle = () => {
  const { resourceId } = useConnectionParams()
  const loggerOpened = useSubscription(loggerOpen(resourceId))

  return (
    <IconButton
      variant="ghost-faint-muted"
      size="icon-sm"
      icon={HistoryIcon}
      label="Query logger"
      side="bottom"
      shortcut={<ShortcutKbd shortcut="queryLogger" />}
      aria-pressed={loggerOpened}
      onClick={() => toggleLogger(resourceId)}
    />
  )
}
