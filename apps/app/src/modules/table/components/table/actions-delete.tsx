import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { enabledFilters } from '@tamery/shared/filters'
import type { GridRow } from '@tamery/table'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tamery/ui/components/alert-dialog'
import { Button } from '@tamery/ui/components/button'
import { cardClass } from '@tamery/ui/components/card.utils'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createRef, useImperativeHandle, useState } from 'react'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { deleteRowsQuery } from '~/core/queries/rows/delete'
import { resourceRowsQueryInfiniteOptions } from '~/core/queries/rows/list'
import { rowIdentity } from '~/core/queries/rows/shape'
import {
  keyedRowsCountQuery,
  resourceTableTotalQueryKey,
} from '~/core/queries/rows/total'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import type { PrimaryKeys } from '~/core/table/session'
import { primaryKeysKey, useTableSessionStore } from '~/core/table/session'
import { getDisplayValue } from '~/core/transformers/value-transformer'
import { queryClient } from '~/lib/query-client'
import { plural } from '~/utils/plural'

import { useTableColumnsContext } from '../../lib/columns'
import { tickedRowCount } from '../../lib/row-selection'
import { useTablePageStore } from '../../lib/store'

const display = (value: unknown) =>
  getDisplayValue(value, Number.MAX_SAFE_INTEGER)

const rowLabel = (primaryKeys: PrimaryKeys) =>
  Object.entries(primaryKeys)
    .map(([column, value]) => `${column} ${display(value)}`)
    .join(' · ')

export const deleteRowsDialogRef = createRef<{
  open: (rows: PrimaryKeys[]) => void
}>()

export const DeleteRowsDialog = ({
  table,
  schema,
}: {
  table: string
  schema: string
}) => {
  const names = useObjectNames()
  const { connectionResource, dialect } = useConnectionContext()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PrimaryKeys[]>([])
  const store = useTablePageStore()
  const sessionStore = useTableSessionStore()
  const { columns } = useTableColumnsContext()

  const deletions = useSubscription(sessionStore, {
    selector: (state) => state.deletions,
  })
  const proposed = deletions.map(primaryKeysKey).join('\n')
  const [shownProposal, setShownProposal] = useState('')
  if (proposed && proposed !== shownProposal) {
    setShownProposal(proposed)
    setRows(deletions)
    setOpen(true)
  }

  useImperativeHandle(deleteRowsDialogRef, () => ({
    open: (next) => {
      setRows(next)
      setOpen(true)
    },
  }))

  const { unique } = rowIdentity(columns, dialect)
  const { data: matched, isPending: isCounting } = useQuery({
    enabled: open && !unique,
    // The global keepPreviousData would show the last delete's count for these rows.
    placeholderData: undefined,
    queryFn: async () =>
      keyedRowsCountQuery({ columns, primaryKeys: rows, schema, table }).run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: ['keyed-rows-count', connectionResource.id, schema, table, rows],
  })
  const counting = !unique && isCounting
  const reached = Math.max(matched ?? 0, rows.length)
  const sameValueRows = reached - rows.length

  const only = reached === 1 ? rows[0] : undefined
  const noun = only ? names.row : plural(reached, names.row)

  const { mutate: deleteRows, isPending: isDeleting } = useMutation({
    meta: { event: 'rows_deleted' },
    mutationFn: async () => {
      await deleteRowsQuery({
        columns,
        primaryKeys: rows,
        schema,
        table,
      }).run(await connectionResourceToQueryParams(connectionResource))
    },
    onError: (error) => {
      toast.error(`Failed to delete ${names.row}s`, {
        description: error.message,
      })
    },
    onSuccess: () => {
      const { filters, orderBy } = store.get()
      toast.success(`${plural(reached, names.row)} successfully deleted`)
      queryClient.invalidateQueries(
        resourceRowsQueryInfiniteOptions({
          connectionResource,
          query: { filters: enabledFilters(filters), orderBy },
          schema,
          table,
        })
      )
      queryClient.invalidateQueries({
        queryKey: resourceTableTotalQueryKey({
          connectionResource,
          schema,
          table,
        }),
      })
      const deleted = new Set(rows.map(primaryKeysKey))
      sessionStore.set((state) => ({
        ...state,
        selected: state.selected.filter(
          (row) => !deleted.has(primaryKeysKey(row))
        ),
      }))
    },
  })

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          sessionStore.set((state) => ({ ...state, deletions: [] }))
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            {only ? (
              <>
                The {names.row} with{' '}
                <span data-mask className="text-foreground font-medium">
                  {rowLabel(only)}
                </span>
              </>
            ) : (
              `These ${names.row}s`
            )}{' '}
            will be removed from{' '}
            <span data-mask className="text-foreground font-medium">
              {table}
            </span>
            . This cannot be undone.
            {sameValueRows > 0 &&
              ` ${plural(sameValueRows, `other ${names.row}`)} with the same values ${sameValueRows === 1 ? 'goes' : 'go'} too.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!only && (
          <div className={cn(cardClass, 'overflow-hidden')}>
            <ScrollArea className="scroll-fade max-h-40">
              <ul>
                {rows.map((primaryKeys) => (
                  <li
                    key={primaryKeysKey(primaryKeys)}
                    data-mask
                    className="border-foreground/6 truncate border-b px-3 py-1.5 text-xs tabular-nums last:border-0"
                  >
                    {rowLabel(primaryKeys)}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogCancel
            variant="destructive"
            disabled={counting}
            onClick={() => deleteRows()}
          >
            <LoadingContent loading={isDeleting || counting}>
              Delete {noun}
            </LoadingContent>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export const ActionsDelete = ({
  keys,
  rows,
}: {
  keys: string[]
  rows: GridRow[]
}) => {
  const names = useObjectNames()
  const sessionStore = useTableSessionStore()
  const selected = useSubscription(sessionStore, {
    selector: (state) => state.selected,
  })
  const ticked = tickedRowCount(selected, rows, keys)
  const openDialog = () => deleteRowsDialogRef.current?.open(selected)

  useShortcut('deleteRows', openDialog, { ignoreInputs: true })

  return (
    <Tooltip shortcut={<ShortcutKbd shortcut="deleteRows" />}>
      <TooltipTrigger
        render={
          <Button
            variant="destructive"
            size="sm"
            aria-label={`Delete (${ticked})`}
            onClick={openDialog}
          />
        }
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        <span>
          Delete (
          <NumberFlow spinTiming={{ duration: 200 }} value={ticked} />)
        </span>
      </TooltipTrigger>
      <TooltipContent>Delete selected {names.row}s</TooltipContent>
    </Tooltip>
  )
}
