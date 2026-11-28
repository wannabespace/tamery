import { Dialect } from '@tamery/shared/enums/connection-type'
import type { ResponseSlots } from '@tamery/ui/components/response'
import { useQuery } from '@tanstack/react-query'

import { tableTypeIcon } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { resultGrid } from '~/core/table/result-grid'

import { ResultGrid } from '../results/statement-card'
import { TablePeek } from '../results/table-peek'
import { ToolCard } from '../tools/tool-card'

const unquote = (name: string) => name.replaceAll(/["`[\]]/gu, '')

/** What an answer's Markdown can do in this connection: peek a table it names in code, and draw its tables as the results grid. */
export const useResponseSlots = (): ResponseSlots => {
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
    linkPreview: true,
    table: ({ aligns, columns, rows }) => (
      <ToolCard>
        <ResultGrid
          aligns={aligns}
          chart={null}
          dialect={Dialect.SQLite}
          grid={resultGrid(
            { affectedRows: null, columns, rows, truncated: false },
            ''
          )}
        />
      </ToolCard>
    ),
    inlineCodeAction: (text) => {
      const target = findTable(text)
      return (
        target && {
          icon: tableTypeIcon[target.type],
          render: (button) => <TablePeek target={target} trigger={button} />,
        }
      )
    },
  }
}
