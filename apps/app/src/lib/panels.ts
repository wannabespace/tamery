import { type } from 'arktype'
import { memoize } from 'memoza'
import type { ComponentType } from 'react'
import { useEffect } from 'react'
import type { WebStorageValue } from 'seitu/web'
import { createWebStorageValue } from 'seitu/web'

import { SHELL_LAYOUT_KEY } from '~/lib/constants'
import { navigatorPanel } from '~/modules/navigator/panel'
import { queryLoggerPanel } from '~/modules/query-logger/panel'

export interface Panel {
  Component: ComponentType
  defaultSize: number
  id: string
  label: string
  maxSize: number | `${number}%`
  minSize: number
  open: (resourceId: string) => WebStorageValue<boolean>
  region: 'left' | 'bottom'
}

const PANELS = [navigatorPanel, queryLoggerPanel]

export const panelSize = memoize(
  (panel: Panel) =>
    createWebStorageValue({
      defaultValue: panel.defaultSize,
      key: `panel-size-${panel.id}`,
      schema: type('number'),
      type: 'localStorage',
    }),
  { cacheKey: (panel) => panel.id }
)

// boot.ts reads this before any JS module loads to size the shell placeholders.
export const useShellLayout = (resourceId: string) => {
  useEffect(() => {
    const write = () =>
      localStorage.setItem(
        SHELL_LAYOUT_KEY,
        JSON.stringify(
          Object.fromEntries(
            PANELS.filter((panel) => panel.open(resourceId).get()).map(
              (panel) => [panel.region, panelSize(panel).get()]
            )
          )
        )
      )
    const unsubscribes = PANELS.flatMap((panel) => [
      panel.open(resourceId).subscribe(write),
      panelSize(panel).subscribe(write),
    ])

    write()

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe()
      }
    }
  }, [resourceId])
}
