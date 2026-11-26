import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  defaultFilter,
} from '@tamery/ui/components/command'
import { FieldDescription } from '@tamery/ui/components/field'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import type { ConnectionResource } from '~/core/connection/sync'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { plural } from '~/utils/plural'

interface CopyTable {
  schema: string
  table: string
}

// Rendering every table of a large database at once freezes the window; typing reaches the rest.
const MAX_TABLES = 100

export type TableSelection =
  | { kind: 'database' }
  | { kind: 'tables'; tables: Map<string, CopyTable> }

export const WHOLE_DATABASE: TableSelection = { kind: 'database' }

export const TablesField = ({
  onSelectionChange,
  resource,
  selection,
}: {
  onSelectionChange: (selection: TableSelection) => void
  resource: ConnectionResource
  selection: TableSelection
}) => {
  const { data } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource: resource })
  )
  const [search, setSearch] = useState('')
  const tables = new Map(
    data?.schemas.flatMap((schema) =>
      schema.tables
        .filter((table) => table.type === 'table' && !table.partition)
        .map((table): [string, CopyTable] => [
          JSON.stringify([schema.name, table.name]),
          { schema: schema.name, table: table.name },
        ])
    )
  )

  const matching = [...tables].filter(
    ([key, entry]) =>
      !search.trim() ||
      defaultFilter(key, search, [entry.schema, entry.table]) > 0
  )
  const hidden = matching.length - MAX_TABLES

  return (
    <>
      <div className="bg-popover ring-foreground/4 overflow-hidden rounded-xl ring">
        <Command variant="flat" label="Tables" shouldFilter={false}>
          <CommandInput
            variant="flat"
            placeholder="Search tables"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="everything"
                keywords={['all']}
                data-checked={selection.kind === 'database' || undefined}
                onSelect={() =>
                  onSelectionChange(
                    selection.kind === 'database'
                      ? { kind: 'tables', tables: new Map() }
                      : WHOLE_DATABASE
                  )
                }
              >
                Everything
              </CommandItem>
              {matching.slice(0, MAX_TABLES).map(([key, entry]) => (
                <CommandItem
                  key={key}
                  value={key}
                  keywords={[entry.schema, entry.table]}
                  data-checked={
                    selection.kind === 'database' ||
                    selection.tables.has(key) ||
                    undefined
                  }
                  onSelect={() => {
                    const next = new Map(
                      selection.kind === 'tables' ? selection.tables : tables
                    )
                    if (next.has(key)) {
                      next.delete(key)
                    } else {
                      next.set(key, entry)
                    }
                    onSelectionChange({ kind: 'tables', tables: next })
                  }}
                >
                  <span data-mask className="min-w-0 truncate">
                    {entry.schema !== data?.defaultSchema && (
                      <span className="text-muted-foreground">
                        {entry.schema}.
                      </span>
                    )}
                    {entry.table}
                  </span>
                </CommandItem>
              ))}
              {hidden > 0 && (
                <div className="text-muted-foreground px-2 py-1.5 text-xs">
                  Search to see {plural(hidden, 'more table')}
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
      <FieldDescription>
        {selection.kind === 'database'
          ? 'Schemas, types, functions, views and data.'
          : `${plural(selection.tables.size, 'table')} with data, indexes and constraints. Types and functions they use must already be in the target.`}
      </FieldDescription>
    </>
  )
}
