import { Dialect } from '@tamery/shared/enums/connection-type'
import { useQuery } from '@tanstack/react-query'

import { tableTypeIcon } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { resultGrid } from '~/core/table/result-grid'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'

import { ResultGrid } from './statement-card'
import { ToolCard } from './tool-card'

const preview = (resourceId: string, tabId: string) => {
  openTab(resourceId, tabId, true)
  history.push(`/connection/${resourceId}/${encodeURIComponent(tabId)}`)
}

const unquote = (name: string) => name.replaceAll(/["`[\]]/gu, '')

/** What an answer's Markdown can do in this connection: open a table it names in code, and draw its tables as the results grid. */
export const useResponseSlots = () => {
  const { connectionResource } = useConnectionContext()
  const { data } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )

  const findTable = (text: string) => {
    const [first, second] = unquote(text).split('.')
    const [schema, table] = second ? [first, second] : [undefined, first]
    if (!table || /\s/u.test(text)) {
      return null
    }
    for (const found of data?.schemas ?? []) {
      const match = found.tables.find(({ name }) => name === table)
      if (match && (!schema || found.name === schema)) {
        return { schema: found.name, table, type: match.type }
      }
    }
    return null
  }

  return {
    table: ({ columns, rows }: { columns: string[]; rows: string[][] }) => (
      <ToolCard>
        <ResultGrid
          chart={null}
          dialect={Dialect.SQLite}
          grid={resultGrid(
            { affectedRows: null, columns, rows, truncated: false },
            ''
          )}
        />
      </ToolCard>
    ),
    inlineCodeAction: (text: string) => {
      const target = findTable(text)
      return (
        target && {
          icon: tableTypeIcon[target.type],
          open: () => {
            preview(
              connectionResource.id,
              tableTabId(target.schema, target.table)
            )
            posthog.capture('ai_chat_table_link_opened')
          },
        }
      )
    },
  }
}
