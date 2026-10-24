import {
  FolderAddIcon,
  PlusSignIcon,
  SidebarLeftIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
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

export const navigatorCommands = ({
  current,
}: CommandContext): CommandEntry[] =>
  current
    ? [
        {
          action: () => createTableDialogRef.current?.create(),
          group: 'Database',
          icon: PlusSignIcon,
          keywords: ['create', 'add', 'table', 'collection'],
          order: 10,
          value: `New ${getCapabilities(getDialect(current.connection.type)).names.table}…`,
        },
        ...(isSqlDialect(getDialect(current.connection.type))
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
        ...(getCapabilities(getDialect(current.connection.type)).flags.includes(
          'schemas'
        )
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
