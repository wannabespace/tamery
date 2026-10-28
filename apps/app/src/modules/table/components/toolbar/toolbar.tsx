import { MoreHorizontalIcon, SourceCodeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import type { ActiveFilter } from '@tamery/shared/filters'
import { enabledFilters } from '@tamery/shared/filters'
import { Button } from '@tamery/ui/components/button'
import { Dialog } from '@tamery/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { ExportDataMenu } from '~/core/export/export-data'
import {
  resourceRowsQuery,
  resourceRowsQueryInfiniteOptions,
} from '~/core/queries/rows/list'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { useTableSessionStore } from '~/core/table/session'
import { ShareDialog } from '~/modules/share/share-dialog'
import { ShareMenuItem } from '~/modules/share/share-menu-item'
import {
  getShareRequestKey,
  shareRequests,
} from '~/modules/share/share-requests'

import { useTableColumnsContext } from '../../lib/columns'
import { useTablePageStore } from '../../lib/store'
import { ActionsAdd } from './actions/actions-add'
import { ActionsColumns } from './actions/actions-columns'
import { ActionsCopy } from './actions/actions-copy'
import { ActionsOrder } from './actions/actions-order'
import { ActionsSeed } from './actions/actions-seed'
import { ActionsView } from './actions/actions-view'
import { FilterSearchBar } from './filter-search-bar'
import { TableStats } from './table-stats'

const EXPORT_PAGE_SIZE = 1000

export const TableToolbar = ({
  onAddColumn,
  onInsertDocument,
  table,
  schema,
}: {
  onAddColumn?: () => void
  onInsertDocument?: () => void
  table: string
  schema: string
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { columns } = useTableColumnsContext()
  const store = useTablePageStore()
  const sessionStore = useTableSessionStore()
  const [seedOpen, setSeedOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const shareRequest = useSubscription(shareRequests)
  const shareKey = getShareRequestKey(connectionResource.id, schema, table)
  if (shareRequest === shareKey && !shareOpen) {
    setShareOpen(true)
  }
  const { data: tablesAndSchemas } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const tableType =
    tablesAndSchemas?.schemas
      .find((s) => s.name === schema)
      ?.tables?.find((t) => t.name === table)?.type ?? 'table'
  const isTable = tableType === 'table'
  const { filters, orderBy } = useSubscription(store, {
    selector: (state) => ({
      filters: enabledFilters(state.filters),
      orderBy: state.orderBy,
    }),
  })
  const selected = useSubscription(sessionStore, {
    selector: (state) => state.selected,
  })

  const {
    data: rows = [],
    hasNextPage,
    isError: isRowsError,
    isPending,
    isPlaceholderData: isRowsPlaceholder,
    isSuccess: isRowsSuccess,
  } = useInfiniteQuery(
    resourceRowsQueryInfiniteOptions({
      columns,
      connectionResource,
      query: { filters, orderBy },
      schema,
      table,
    })
  )

  const getData = async ({
    filters: selection,
    limit,
  }: {
    filters?: ActiveFilter[]
    limit?: number
  }) => {
    const queryParams =
      await connectionResourceToQueryParams(connectionResource)
    const fetchRows = (offset: number, pageSize: number) =>
      resourceRowsQuery({
        columns,
        limit: pageSize,
        offset,
        query: {
          filters: selection ?? filters,
          filtersConcatOperator: selection ? 'OR' : 'AND',
          orderBy: {
            ...orderBy,
            ...Object.fromEntries(
              columns
                .filter(
                  (column) => column.primaryKey && !(column.id in orderBy)
                )
                .map((column) => [column.id, 'ASC' as const])
            ),
          },
        },
        schema,
        table,
      }).run(queryParams)

    if (limit) {
      return fetchRows(0, limit)
    }

    const allRows: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
      // oxlint-disable-next-line no-await-in-loop -- a short page is the only end signal
      const page = await fetchRows(offset, EXPORT_PAGE_SIZE)
      allRows.push(...page)
      if (page.length < EXPORT_PAGE_SIZE) {
        return allRows
      }
    }
  }

  return (
    <div className="flex shrink-0 items-start gap-2 px-3 py-2">
      <TableStats
        failed={isRowsError}
        filters={filters}
        loaded={
          isRowsSuccess && !isRowsPlaceholder && !hasNextPage
            ? rows.length
            : undefined
        }
        ready={isRowsSuccess && !isRowsPlaceholder}
        schema={schema}
        table={table}
      />
      <FilterSearchBar table={table} schema={schema} />
      <div className="flex shrink-0 items-center gap-1">
        <ActionsColumns />
        <ActionsOrder />
        <ActionsView />
        {isTable && (
          <ActionsAdd
            onAddColumn={onAddColumn}
            onInsertDocument={onInsertDocument}
            onSeed={() => setSeedOpen(true)}
          />
        )}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              aria-label="More actions"
              render={
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="icon" />}
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent side="bottom">More actions</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-44">
            <ExportDataMenu
              selected={selected}
              filename={`${schema}_${table}`}
              getData={getData}
              disabled={rows.length === 0 || isPending}
            />
            {isTable && (
              <DropdownMenuItem onClick={() => setCodeOpen(true)}>
                <HugeiconsIcon icon={SourceCodeIcon} strokeWidth={2} />
                Code
              </DropdownMenuItem>
            )}
            {isSqlDialect(dialect) && (
              <ShareMenuItem
                schema={schema}
                table={table}
                onOpen={() => setShareOpen(true)}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog
          open={shareOpen}
          onOpenChange={(open) => {
            setShareOpen(open)
            if (!open && shareRequest === shareKey) {
              shareRequests.set(null)
            }
          }}
        >
          <ShareDialog schema={schema} table={table} />
        </Dialog>
        {isTable && (
          <>
            <ActionsSeed
              table={table}
              schema={schema}
              open={seedOpen}
              onOpenChange={setSeedOpen}
            />
            <ActionsCopy
              table={table}
              schema={schema}
              open={codeOpen}
              onOpenChange={setCodeOpen}
            />
          </>
        )}
      </div>
    </div>
  )
}
