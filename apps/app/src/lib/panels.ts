import { type } from 'arktype'
import { memoize } from 'memoza'
import type { ComponentType } from 'react'
import { useEffect } from 'react'
import type { WebStorageValue } from 'seitu/web'
import { createWebStorageValue } from 'seitu/web'

import { SHELL_LAYOUT_KEY } from '~/lib/constants'
import { chatPanel } from '~/modules/chat/panel'
import { agentModeValue } from '~/modules/chat/stores'
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
  region: 'left' | 'right' | 'bottom'
}

const PANELS = [navigatorPanel, queryLoggerPanel, chatPanel]

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
            PANELS.filter(
              (panel) =>
                panel.open(resourceId).get() &&
                !(panel === chatPanel && agentModeValue.get())
            ).map((panel) => [panel.region, panelSize(panel).get()])
          )
        )
      )
    const unsubscribes = [
      agentModeValue.subscribe(write),
      ...PANELS.flatMap((panel) => [
        panel.open(resourceId).subscribe(write),
        panelSize(panel).subscribe(write),
      ]),
    ]

    write()

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe()
      }
    }
  }, [resourceId])
}
