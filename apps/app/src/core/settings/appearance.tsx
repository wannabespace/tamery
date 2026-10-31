import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { Switch } from '@tamery/ui/components/switch'
import { isMac } from '@tamery/ui/lib/os'
import type { Theme } from '@tamery/ui/theme-store'
import { themeStore, useTheme } from '@tamery/ui/theme-store'
import { useSubscription } from 'seitu/react'

import { posthog } from '~/lib/posthog'
import { transparentBackgroundValue } from '~/lib/transparent-background'

import { AppIconRow } from './app-icon-row'

const THEMES: { label: string; value: Theme }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const hasVibrancy = !!window.electron && isMac

export const AppearanceSettings = () => {
  const theme = useTheme()
  const isTransparent = useSubscription(transparentBackgroundValue)

  return (
    <SettingsGroup>
      <SettingsRow
        title="Theme"
        description="Follow the system appearance or keep Tamery light or dark."
      >
        <Select
          items={THEMES}
          value={theme}
          onValueChange={(next) => {
            if (next) {
              themeStore.set(next)
              posthog.capture('theme_changed', { theme: next })
            }
          }}
        >
          <SelectTrigger size="sm" aria-label="Theme" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent size="sm">
            {THEMES.map(({ label, value }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      {hasVibrancy && (
        <SettingsRow
          htmlFor="transparent-background"
          title="Transparent background"
          description="Let the desktop show through the window background."
        >
          <Switch
            id="transparent-background"
            size="sm"
            checked={isTransparent}
            onCheckedChange={(enabled) => {
              transparentBackgroundValue.set(enabled)
              posthog.capture('transparent_background_changed', { enabled })
            }}
          />
        </SettingsRow>
      )}
      {window.electron && <AppIconRow />}
    </SettingsGroup>
  )
}
