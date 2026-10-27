import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import { Skeleton } from '@tamery/ui/components/skeleton'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useRef, useState } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { useShortcuts } from '~/core/keyboard/use-shortcuts'
import { matchingRowsQueryOptions } from '~/core/queries/rows/list'
import { searchRowsQueryOptions } from '~/core/queries/rows/search'
import type { ValueTransformer } from '~/core/transformers/value-transformer'
import { getDisplayValue } from '~/core/transformers/value-transformer'

import type { CellEdit, GridCursor } from '../cursor'
import { labelCandidates, useReferencedColumns } from '../referenced-columns'
import type { Column } from './utils'

const PREVIEW_CHARS = 40
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/u
// Hex-only text is an id, not something a person named.
const NAMED = /[g-z]/iu

const isNamed = (value: unknown): value is string =>
  typeof value === 'string' && NAMED.test(value) && !DATE_LIKE.test(value)

const rowPreview = (row: Record<string, unknown>, key: string) =>
  Object.entries(row)
    .filter(([id, value]) => id !== key && value !== null && value !== '')
    .toSorted(([, a], [, b]) => Number(isNamed(b)) - Number(isNamed(a)))
    .map(([id, value]) => `${id} ${getDisplayValue(value, PREVIEW_CHARS)}`)
    .join(' · ')

const SUGGESTIONS = 50
const LOADING_ROWS = 4

type Row = Record<string, unknown>

/** cmdk highlights the first item, so the current value leads an untouched edit and Enter keeps it. */
const leadWithCurrent = ({
  fetched,
  key,
  raw,
  rows,
  value,
}: {
  fetched: Row | undefined
  key: string
  raw: (value: unknown) => string
  rows: Row[]
  value: unknown
}): Row[] => {
  const isCurrent = (row: Row) => raw(row[key]) === raw(value)
  return [
    rows.find(isCurrent) ?? fetched ?? { [key]: value },
    ...rows.filter((row) => !isCurrent(row)),
  ]
}

const OptionLabel = ({
  keyColumn,
  loading,
  row,
}: {
  keyColumn: string
  loading: boolean
  row: Row
}) => {
  const details = rowPreview(row, keyColumn)
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span data-mask className="truncate tabular-nums">
        {getDisplayValue(row[keyColumn], PREVIEW_CHARS)}
      </span>
      {details ? (
        <span data-mask className="text-muted-foreground text-2xs truncate">
          {details}
        </span>
      ) : (
        loading && <Skeleton className="my-0.5 h-2.5 w-40" />
      )}
    </span>
  )
}

const LoadingRows = () => (
  <div aria-hidden className="flex flex-col gap-3 px-3 py-2">
    {Array.from({ length: LOADING_ROWS }, (_, index) => (
      <div key={index} className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-2.5 w-40" />
      </div>
    ))}
  </div>
)

export const CellReference = ({
  column,
  cursor,
  edit,
  foreign,
  transformer,
  value,
}: {
  column: Column
  cursor: GridCursor
  edit: CellEdit | null
  foreign: NonNullable<Column['foreign']>
  transformer: ValueTransformer
  value: unknown
}) => {
  const { connectionResource } = useConnectionContext()
  const ref = useRef<HTMLInputElement>(null)
  const [highlighted, setHighlighted] = useState('')
  const raw = (rowValue: unknown) =>
    rowValue === null ? '' : transformer.fromConnection(rowValue).toRaw()
  const hasValue = value !== null && value !== undefined
  const text = edit?.text ?? ''
  const untouched = text === raw(value)
  const term = useDeferredValue(untouched ? '' : text)

  const columns = useReferencedColumns([column]).get(column.id)
  const browsing = term === ''
  const searchedColumns = browsing
    ? []
    : [
        foreign.column,
        ...labelCandidates(columns ?? [], foreign.column).map(({ id }) => id),
      ]
  const { data: rows = [], isPending } = useQuery({
    ...searchRowsQueryOptions({
      columns: searchedColumns,
      connectionResource,
      limit: SUGGESTIONS,
      schema: foreign.schema,
      table: foreign.table,
      term,
    }),
    enabled: browsing || columns !== undefined,
  })
  const { data: [currentRow] = [], isLoading: isCurrentLoading } =
    useInfiniteQuery({
      ...matchingRowsQueryOptions({ connectionResource, ...foreign, value }),
      enabled: hasValue,
    })

  const options =
    untouched && hasValue
      ? leadWithCurrent({
          fetched: currentRow,
          key: foreign.column,
          raw,
          rows,
          value,
        })
      : rows
  const keys = options.map((row) => raw(row[foreign.column]))
  const highlightedKey = keys.includes(highlighted)
    ? highlighted
    : (keys[0] ?? '')

  useHotkeys(
    [
      {
        callback: () => cursor.leave(0, 0),
        hotkey: 'Enter',
        options: { enabled: options.length === 0 && !isPending },
      },
    ],
    { ignoreInputs: false, target: ref }
  )
  useShortcuts(
    [
      {
        callback: () => {
          if (highlightedKey) {
            cursor.change(highlightedKey)
          }
          cursor.fill()
        },
        shortcut: 'applyEdit',
      },
    ],
    { ignoreInputs: false, target: ref }
  )

  return (
    <Command
      size="sm"
      variant="transparent"
      shouldFilter={false}
      loop
      // cmdk drops its highlight when the highlighted item unmounts beside others (new results), leaving Enter dead.
      value={highlightedKey}
      onValueChange={setHighlighted}
      aria-label={`Value of ${column.id}`}
    >
      <CommandInput
        ref={ref}
        data-mask
        variant="flat"
        autoFocus
        onFocus={({ currentTarget }) => currentTarget.select()}
        placeholder={edit?.text === null ? 'null' : `Search ${foreign.table}…`}
        value={text}
        onValueChange={(next) => cursor.change(next)}
      />
      <CommandList>
        <CommandEmpty>
          {isPending ? (
            'Searching…'
          ) : (
            <>
              No matching <span data-mask>{foreign.table}</span> rows
            </>
          )}
        </CommandEmpty>
        <CommandGroup>
          {options.map((row) => {
            const key = raw(row[foreign.column])
            return (
              <CommandItem
                key={key}
                value={key}
                data-checked={hasValue && key === raw(value)}
                onSelect={() => {
                  cursor.change(key)
                  cursor.leave(0, 0)
                }}
              >
                <OptionLabel
                  keyColumn={foreign.column}
                  loading={isPending || isCurrentLoading}
                  row={row}
                />
              </CommandItem>
            )
          })}
        </CommandGroup>
        {isPending && options.length > 0 && <LoadingRows />}
      </CommandList>
    </Command>
  )
}
