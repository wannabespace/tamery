import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { getDialect } from '@tamery/shared/enums/connection-type'

import { getCapabilities } from '~/core/catalog/capabilities'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { parseTableTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'
import type {
  CommandContext,
  CommandEntry,
} from '~/modules/actions-center/types'

import { columnDialogRef } from './components/table/column-dialog'

export const tableCommands = ({
  current,
  tabId,
}: CommandContext): CommandEntry[] => {
  const active = tabId ? parseTableTabId(tabId) : null

  if (!(current && active)) {
    return []
  }

  const isBaseTable =
    queryClient
      .getQueryData(
        resourceTablesAndSchemasQueryOptions({
          connectionResource: current.connectionResource,
        }).queryKey
      )
      ?.schemas.find((schema) => schema.name === active.schema)
      ?.tables.find((table) => table.name === active.table)?.type === 'table'

  return isBaseTable &&
    getCapabilities(getDialect(current.connection.type)).flags.includes(
      'declaredColumns'
    )
    ? [
        {
          action: () => columnDialogRef.current?.add(),
          group: 'Database',
          icon: PlusSignIcon,
          keywords: ['create', 'new', 'column', active.table],
          order: 40,
          value: 'Add column…',
        },
      ]
    : []
}
