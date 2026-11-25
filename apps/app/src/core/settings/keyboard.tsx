import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Ctrl } from '@tamery/ui/components/custom/shortcuts'
import { Switch } from '@tamery/ui/components/switch'
import { shortcutRevealStore } from '@tamery/ui/hooks/use-shortcut-reveal'
import { useSubscription } from 'seitu/react'

import { posthog } from '~/lib/posthog'

import { ShortcutsList } from './shortcuts'

export const KeyboardSettings = () => {
  const isShortcutRevealOn = useSubscription(shortcutRevealStore)

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          htmlFor="shortcut-reveal"
          title={
            <>
              Show shortcuts while holding{' '}
              <Ctrl userAgent={navigator.userAgent} />
            </>
          }
          description="Holding the key for a moment shows each control's shortcut on top of it."
        >
          <Switch
            id="shortcut-reveal"
            size="sm"
            checked={isShortcutRevealOn}
            onCheckedChange={(enabled) => {
              shortcutRevealStore.set(enabled)
              posthog.capture('shortcut_reveal_toggled', { enabled })
            }}
          />
        </SettingsRow>
      </SettingsGroup>
      <ShortcutsList />
    </>
  )
}
