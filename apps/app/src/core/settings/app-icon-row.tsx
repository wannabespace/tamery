import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import {
  SwatchGroup,
  SwatchGroupItem,
} from '@tamery/ui/components/swatch-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { isMac } from '@tamery/ui/lib/os'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { queryClient } from '~/lib/query-client'

type AppIcon = Awaited<
  ReturnType<NonNullable<typeof window.electron>['appIcon']['get']>
>

const APP_ICONS: { label: string; value: AppIcon }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Blue', value: 'blue' },
  { label: 'Dark', value: 'dark' },
]

const APP_ICON_QUERY_KEY = ['app-icon']

export const AppIconRow = () => {
  const { data: icon } = useQuery({
    queryFn: () => window.electron?.appIcon.get(),
    queryKey: APP_ICON_QUERY_KEY,
  })
  const { data: previews } = useQuery({
    queryFn: () => window.electron?.appIcon.previews(),
    queryKey: ['app-icon-previews'],
  })
  const { mutate } = useMutation({
    meta: { event: 'app_icon_changed' },
    mutationFn: async (next: AppIcon) =>
      await window.electron?.appIcon.set(next),
    onError: (error) => toast.error(error.message),
    onSuccess: (_, next) => queryClient.setQueryData(APP_ICON_QUERY_KEY, next),
  })

  useEffect(
    () =>
      window.electron?.app.onFocusChange((isFocused) => {
        if (isFocused) {
          void queryClient.invalidateQueries({ queryKey: APP_ICON_QUERY_KEY })
        }
      }),
    []
  )

  return (
    <SettingsRow
      title="App icon"
      description={`The icon Tamery shows in the ${isMac ? 'Dock' : 'taskbar'}.`}
    >
      {icon && previews && (
        <SwatchGroup
          aria-label="App icon"
          value={[icon]}
          onValueChange={([next]) => {
            if (next) {
              mutate(next)
            }
          }}
        >
          {APP_ICONS.map(({ label, value }) => (
            <Tooltip key={value}>
              <TooltipTrigger
                render={
                  <SwatchGroupItem
                    variant="picture"
                    value={value}
                    aria-label={label}
                  >
                    <img src={previews[value]} alt="" className="size-full" />
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
