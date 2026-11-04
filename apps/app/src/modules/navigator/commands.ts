import {
  FolderAddIcon,
  PlusSignIcon,
  SidebarLeftIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { getDialect, isSqlDialect } from '@tamery/shared/enums/connection-type'

import { getCapabilities } from '~/core/catalog/capabilities'
import type {
  CommandContext,
  CommandEntry,
} from '~/modules/actions-center/types'

import { createSchemaDialogRef } from './create-schema-dialog'
import { createTableDialogRef } from './create-table-dialog'
import { createViewDialogRef } from './create-view-dialog'
import { toggleNavigator } from './stores'

const createCommands = (dialect: Dialect): CommandEntry[] => {
  const { flags, names } = getCapabilities(dialect)
  if (flags.includes('readOnly')) {
    return []
  }
  return [
    {
      action: () => createTableDialogRef.current?.create(),
      group: 'Database',
      icon: PlusSignIcon,
      keywords: ['create', 'add', 'table', 'collection'],
      order: 10,
      value: `New ${names.table}…`,
    },
    ...(isSqlDialect(dialect)
      ? [
          {
            action: () => createViewDialogRef.current?.create(),
            group: 'Database',
            icon: ViewIcon,
            keywords: ['create', 'add', 'view', 'materialized'],
            order: 15,
            value: 'New view…',
          } satisfies CommandEntry,
        ]
      : []),
    ...(flags.includes('schemas')
      ? [
          {
            action: () => createSchemaDialogRef.current?.create(),
            group: 'Database',
            icon: FolderAddIcon,
            keywords: ['create', 'add', 'schema', 'database', 'namespace'],
            order: 20,
            value: 'New schema…',
          } satisfies CommandEntry,
        ]
      : []),
  ]
}

export const navigatorCommands = ({
  current,
}: CommandContext): CommandEntry[] =>
  current
    ? [
        ...createCommands(getDialect(current.connection.type)),
        {
          action: toggleNavigator,
          group: 'View',
          icon: SidebarLeftIcon,
          keywords: ['navigator', 'panel', 'hide', 'show'],
          order: 10,
          shortcut: 'toggleNavigator',
          value: 'Toggle sidebar',
        },
      ]
    : []
