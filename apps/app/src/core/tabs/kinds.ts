import type { Dialect } from '@tamery/shared/enums/connection-type'

import { chatTab } from '~/modules/chat/tab'
import {
  definitionsSchemaItem,
  definitionsTab,
} from '~/modules/definitions/lib/tab'
import { runnerTab } from '~/modules/runner/lib/tab'
import { tableTab } from '~/modules/table/lib/tab'
import {
  visualizerSchemaItem,
  visualizerTab,
} from '~/modules/visualizer/lib/tab'

import type { ConnectionTab, TabKind } from './types'

const TAB_KINDS: TabKind[] = [
  chatTab,
  definitionsTab,
  runnerTab,
  tableTab,
  visualizerTab,
]

const SCHEMA_GROUPS = [
  { items: [visualizerSchemaItem], label: 'Overview' },
  {
    items: [
      definitionsSchemaItem('indexes'),
      definitionsSchemaItem('constraints'),
    ],
    label: 'Structure',
  },
  { items: [definitionsSchemaItem('enums')], label: 'Types' },
  {
    items: [
      definitionsSchemaItem('functions'),
      definitionsSchemaItem('triggers'),
    ],
    label: 'Logic',
  },
  {
    items: [
      definitionsSchemaItem('policies'),
      definitionsSchemaItem('privileges'),
    ],
    label: 'Security',
  },
]

export const schemaItems = SCHEMA_GROUPS.flatMap((group) => group.items)

export const schemaGroups = (dialect: Dialect) =>
  SCHEMA_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.available?.(dialect) ?? true),
  })).filter((group) => group.items.length > 0)

export const resolveTab = (id: string) => {
  for (const kind of TAB_KINDS) {
    const params = kind.match(id)

    if (params !== null) {
      return { kind, params }
    }
  }

  return null
}

export type ResolvedTab = NonNullable<ReturnType<typeof resolveTab>>

export const tabFullTitle = ({ kind, params }: ResolvedTab) =>
  kind.fullTitle?.(params) ?? kind.title(params)

/** `titles` names tabs whose label lives in a collection rather than in the id, like a chat's generated title. */
export const tabLabels = (
  tabs: ConnectionTab[],
  titles: Map<string, string>
) => {
  const resolved = tabs.map((tab) => resolveTab(tab.id))

  return tabs.map((tab, index) => {
    const own = resolved[index]
    const siblings = resolved
      .filter((other) => other?.kind === own?.kind)
      .map((other) => other?.params)
    const defaultLabel =
      titles.get(tab.id) ??
      (own
        ? (own.kind.label?.(own.params, siblings) ?? own.kind.title(own.params))
        : '')

    return { defaultLabel, label: tab.title ?? defaultLabel }
  })
}
