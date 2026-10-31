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
import {
  SwatchGroup,
  SwatchGroupItem,
} from '@tamery/ui/components/swatch-group'
import { Switch } from '@tamery/ui/components/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { isMac } from '@tamery/ui/lib/os'
import type { Theme } from '@tamery/ui/theme-store'
import { themeStore, useTheme } from '@tamery/ui/theme-store'
import { useQuery } from '@tanstack/react-query'
import { useSubscription } from 'seitu/react'

import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'
import { transparentBackgroundValue } from '~/lib/transparent-background'

const THEMES: { label: string; value: Theme }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

type AppIcon = Parameters<
  NonNullable<typeof window.electron>['appIcon']['set']
>[0]

const APP_ICONS: { label: string; value: AppIcon }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Blue', value: 'blue' },
  { label: 'Dark', value: 'dark' },
]

const APP_ICON_QUERY_KEY = ['app-icon']

const hasVibrancy = !!window.electron && isMac

const AppIconRow = () => {
  const { data } = useQuery({
    queryFn: () => window.electron?.appIcon.get(),
    queryKey: APP_ICON_QUERY_KEY,
  })

  return (
    <SettingsRow
      title="App icon"
      description={`The icon Tamery shows in the ${isMac ? 'Dock' : 'taskbar'}.`}
    >
      {data && (
        <SwatchGroup
          aria-label="App icon"
          value={[data.icon]}
          onValueChange={([next]) => {
            if (next) {
              queryClient.setQueryData(APP_ICON_QUERY_KEY, {
                ...data,
                icon: next,
              })
              void window.electron?.appIcon.set(next)
              posthog.capture('app_icon_changed', { icon: next })
            }
          }}
        >
          {APP_ICONS.map(({ label, value }) => (
            <Tooltip key={value}>
              <TooltipTrigger
                render={
                  <SwatchGroupItem size="lg" value={value} aria-label={label}>
                    <img
                      src={data.previews[value]}
                      alt=""
                      className="size-full"
                    />
                  </SwatchGroupItem>
                }
              />
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </SwatchGroup>
      )}
    </SettingsRow>
  )
}

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
