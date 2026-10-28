import { HierarchyIcon } from '@hugeicons/core-free-icons'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'

import type { SchemaItem, TabKind } from '~/core/tabs/types'

export const VISUALIZER_TAB_ID = 'visualizer'

export const visualizerSchemaItem: SchemaItem = {
  available: isSqlDialect,
  icon: HierarchyIcon,
  label: 'Visualizer',
  tabId: VISUALIZER_TAB_ID,
}

export const visualizerTab: TabKind = {
  available: (_params, dialect) => isSqlDialect(dialect),
  icon: () => HierarchyIcon,
  match: (id) => (id === VISUALIZER_TAB_ID ? {} : null),
  title: () => 'Visualizer',
  type: 'visualizer',
}
