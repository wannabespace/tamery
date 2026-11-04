import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RefreshButton } from '@tamery/ui/components/custom/refresh-button'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSubscription } from 'seitu/react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { tableTabId } from '~/core/tabs/ids'

import { useNavigatorSearch } from './keyboard'
import { pinnedTable } from './pinned-tables'
import { navigatorStore } from './stores'
import { TablesList } from './tables-list'
import { buildTreeRows } from './tree-row'

export const TablesPanel = ({
  onCreateTable,
}: {
  onCreateTable: (schema?: string) => void
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const names = useObjectNames()
  const { tabId: activeTabId } = useParams({ strict: false })
  const store = navigatorStore(connectionResource.id)
  const search = useSubscription(store, {
    selector: (state) => state.tablesSearch,
  })
  const setSearch = (tablesSearch: string) =>
    store.set((state) => ({ ...state, tablesSearch }) satisfies typeof state)
  const {
    data: tablesAndSchemas,
    isPending,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery(resourceTablesAndSchemasQueryOptions({ connectionResource }))
  const pinnedTables = useSubscription(store, {
    selector: (state) => state.pinnedTables,
  })
  const openedSchemas = useSubscription(store, {
    selector: (state) =>
      state.tablesTreeOpenedSchemas ?? [
        tablesAndSchemas?.schemas[0]?.name ?? 'public',
      ],
  })

  useEffect(() => {
    if (!tablesAndSchemas) {
      return
    }

    pinnedTable.cleanup(
      connectionResource.id,
      tablesAndSchemas.schemas.flatMap((schema) =>
        schema.tables.map((table) => ({
          schema: schema.name,
          table: table.name,
        }))
      )
    )
  }, [connectionResource, tablesAndSchemas])

  const rows = buildTreeRows({
    openedSchemas,
    pinnedTables,
    schemas: tablesAndSchemas?.schemas ?? [],
    search,
    showSchemaRows: getCapabilities(dialect).flags.includes('schemas'),
  })

  const toggleSchema = (name: string) => {
    store.set(
      (state) =>
        ({
          ...state,
          tablesTreeOpenedSchemas: openedSchemas.includes(name)
            ? openedSchemas.filter((schema) => schema !== name)
            : [...openedSchemas, name],
        }) satisfies typeof state
    )
  }

  const activeId = rows.find(
    (row) =>
      row.kind === 'table' &&
      tableTabId(row.schema, row.table.name) === activeTabId
  )?.id

  const { highlightedControlId, highlightedId, listId, searchProps } =
    useNavigatorSearch({
      activeId,
      nodes: rows.filter(
        (row) => row.kind !== 'empty' && row.kind !== 'separator'
      ),
      onClear: () => setSearch(''),
      search,
    })

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 pb-1.5 pl-2">
        <SearchInput
          className="flex-1"
          size="sm"
          data-mask
          placeholder="Search"
          aria-label={`Search ${names.table}s`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          start={
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="text-muted-foreground/70 size-3.5"
            />
          }
          {...searchProps}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <RefreshButton
                aria-label={`Refresh ${names.table}s`}
                variant="outline-muted"
                size="icon-sm"
                onClick={() => refetch()}
                refreshing={isFetching}
              />
            }
          />
          <TooltipContent side="bottom">
            <div className="flex flex-col gap-0.5">
              <span>
                Refresh {names.table}s
                {getCapabilities(dialect).flags.includes('schemas') &&
                  ' and schemas'}
              </span>
              <span className="opacity-70">
                Last updated:{' '}
                {dataUpdatedAt
                  ? new Date(dataUpdatedAt).toLocaleTimeString()
                  : 'never'}
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
      <TablesList
        className="min-h-0 flex-1"
        activeId={activeId}
        highlightedControlId={highlightedControlId}
        highlightedId={highlightedId}
        isPending={isPending}
        listId={listId}
        rows={rows}
        search={search}
        onCreateTable={onCreateTable}
        onToggleSchema={toggleSchema}
      />
    </>
  )
}
