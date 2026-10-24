import { LayoutTable02Icon, ViewIcon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { uppercaseFirst } from '@tamery/shared/utils'

import type { tablesAndSchemasType } from '~/core/queries/tables/list'

import { getCapabilities } from './capabilities'

export type TableType = (typeof tablesAndSchemasType.infer)['type']

export const tableTypeIcon = {
  'materialized view': ViewIcon,
  table: LayoutTable02Icon,
  view: ViewIcon,
} satisfies Record<TableType, IconSvgElement>

const VIEW_LABELS = {
  'materialized view': 'Materialized view',
  view: 'View',
} satisfies Record<Exclude<TableType, 'table'>, string>

export const getTableTypeLabel = (dialect: Dialect, tableType: TableType) =>
  tableType === 'table'
    ? uppercaseFirst(getCapabilities(dialect).names.table)
    : VIEW_LABELS[tableType]
