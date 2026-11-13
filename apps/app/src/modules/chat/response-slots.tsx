import { Button } from '@tamery/ui/components/button'
import { useQuery } from '@tanstack/react-query'

import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'
import { openRunnerTab } from '~/modules/runner/lib/new-query'
import { runnerPageStore, setQuery } from '~/modules/runner/lib/store'

const show = (resourceId: string, tabId: string) => {
  openTab(resourceId, tabId)
  history.push(`/connection/${resourceId}/${encodeURIComponent(tabId)}`)
}

const unquote = (name: string) => name.replaceAll(/["`[\]]/gu, '')

/** What an answer's Markdown can do in this connection: open its SQL in a Query tab, and open a table it names in code. */
export const useResponseSlots = () => {
  const { connectionResource, dialect } = useConnectionContext()
  const { data } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )

  const findTable = (text: string) => {
    const [first, second] = unquote(text).split('.')
    const [schema, table] = second ? [first, second] : [undefined, first]
    if (!table || /\s/u.test(text)) {
      return null
    }
    const found = data?.schemas
      .filter(({ name }) => !schema || name === schema)
      .find(({ tables }) => tables.some(({ name }) => name === table))
    return found ? { schema: found.name, table } : null
  }

  return {
    codeActions: (code: string, language: string) =>
      language === 'sql' && (
        <Button
          variant="ghost-muted"
          size="xs"
          onClick={() => {
            const tabId = openRunnerTab(connectionResource.id)
            setQuery(
              runnerPageStore({
                dialect,
                resourceId: connectionResource.id,
                tabId,
              }),
              code
            )
            show(connectionResource.id, tabId)
            posthog.capture('ai_chat_code_opened')
          }}
        >
          Open in Query
        </Button>
      ),
    inlineCodeAction: (text: string) => {
      const target = findTable(text)
      return (
        target &&
        (() => {
          show(connectionResource.id, tableTabId(target.schema, target.table))
          posthog.capture('ai_chat_table_link_opened')
        })
      )
    },
  }
}
