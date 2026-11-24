import { Key01Icon, Link01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { valueToText } from '@tamery/shared/value-text'
import { Item } from '@tamery/ui/components/item'
import { type } from 'arktype'

import type { AgentTarget } from '~/core/agent/target'
import { resolveResource } from '~/core/agent/target'
import type { TableType } from '~/core/catalog/table-type'
import { tableTypeIcon } from '~/core/catalog/table-type'
import { openTab } from '~/core/tabs/actions'
import { tabPath, tableTabId } from '~/core/tabs/ids'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'

import type { ChatToolPart } from './chat-tool-types'

// Transcripts keep a tool's output as JSON, and an older one may lack a field, so each view reads only what it draws.
const describedTable = type({
  columns: type({
    name: 'string',
    nullable: 'boolean',
    type: 'string',
  }).array(),
  constraints: type({
    columns: 'string[]',
    'references?': 'object',
    'type?': 'string',
  }).array(),
})

const tableType = type("'table' | 'view' | 'materialized view'")

const listedTables = type({
  schemas: type({
    name: 'string',
    tables: type({ name: 'string', type: tableType }).array(),
  }).array(),
})

const schemaMatches = type({
  columns: type({
    column: 'string',
    schema: 'string',
    table: 'string',
    type: 'string',
  }).array(),
  tables: type({ schema: 'string', table: 'string', type: tableType }).array(),
})

const columnValues = type({
  values: type({ count: 'number', value: 'unknown' }).array(),
})

type Constraint = (typeof describedTable.infer)['constraints'][number]

interface TableRow {
  schema: string
  table: string
  type: TableType
}

const ColumnRow = ({
  column,
  foreign,
  primary,
}: {
  column: (typeof describedTable.infer)['columns'][number]
  foreign: boolean
  primary: boolean
}) => (
  <li className="flex h-6 items-center gap-1.5 text-xs">
    {primary && (
      <HugeiconsIcon
        icon={Key01Icon}
        strokeWidth={2}
        className="text-primary size-3 shrink-0"
      />
    )}
    {!primary && foreign && (
      <HugeiconsIcon
        icon={Link01Icon}
        strokeWidth={2}
        className="text-muted-foreground/70 size-3 shrink-0"
      />
    )}
    <span data-mask className="truncate font-mono">
      {column.name}
    </span>
    <span
      data-mask
      className="text-muted-foreground/70 ml-auto max-w-[45%] shrink-0 truncate font-mono"
    >
      {column.type}
      {column.nullable && '?'}
    </span>
  </li>
)

const TableRows = ({
  tables,
  target,
  tool,
}: {
  tables: TableRow[]
  target: AgentTarget
  tool: ChatToolPart['type']
}) => {
  const open = ({ schema, table }: TableRow) => {
    const { resource } = resolveResource(target)
    const tabId = tableTabId(schema, table)
    openTab(resource.id, tabId)
    history.push(tabPath(resource.id, tabId))
    posthog.capture('ai_chat_lookup_table_opened', { tool })
  }
  return (
    <ul className="-mx-1.5 flex flex-col">
      {tables.map((row) => (
        <li key={`${row.schema}.${row.table}`} className="flex">
          <Item
            size="2xs"
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Item renders the row's names inside this button
            render={<button type="button" />}
            onClick={() => open(row)}
          >
            <HugeiconsIcon
              icon={tableTypeIcon[row.type]}
              strokeWidth={2}
              className="text-muted-foreground size-3.5 shrink-0"
            />
            <span data-mask className="truncate">
              {row.table}
            </span>
            <span data-mask className="text-muted-foreground/70 truncate">
              {row.schema}
            </span>
          </Item>
        </li>
      ))}
    </ul>
  )
}

/** What a lookup read, drawn the way the app draws it elsewhere; never its JSON. Null when the output is not one of these shapes. */
export const getLookupDetail = (part: ChatToolPart) => {
  if (part.state !== 'output-available') {
    return null
  }
  switch (part.type) {
    case 'tool-describe_table': {
      const described = describedTable(part.output)
      if (described instanceof type.errors) {
        return null
      }
      const { constraints } = described
      const keyed = (isKey: (constraint: Constraint) => boolean) =>
        new Set(constraints.filter(isKey).flatMap(({ columns }) => columns))
      const primary = keyed((constraint) => constraint.type === 'PRIMARY KEY')
      const foreign = keyed((constraint) => !!constraint.references)
      return (
        <ul className="flex flex-col">
          {described.columns.map((column) => (
            <ColumnRow
              key={column.name}
              column={column}
              foreign={foreign.has(column.name)}
              primary={primary.has(column.name)}
            />
          ))}
        </ul>
      )
    }
    case 'tool-list_tables': {
      const listed = listedTables(part.output)
      if (listed instanceof type.errors) {
        return null
      }
      return (
        <TableRows
          target={part.input}
          tool={part.type}
          tables={listed.schemas.flatMap(({ name, tables }) =>
            tables.map((table) => ({
              schema: name,
              table: table.name,
              type: table.type,
            }))
          )}
        />
      )
    }
    case 'tool-search_schema': {
      const found = schemaMatches(part.output)
      if (found instanceof type.errors) {
        return null
      }
      return (
        <>
          {found.tables.length > 0 && (
            <TableRows
              target={part.input}
              tool={part.type}
              tables={found.tables}
            />
          )}
          {found.columns.length > 0 && (
            <ul className="flex flex-col">
              {found.columns.map((column) => (
                <li
                  key={`${column.schema}.${column.table}.${column.column}`}
                  className="flex h-6 items-center gap-1.5 text-xs"
                >
                  <span data-mask className="truncate font-mono">
                    {column.table}.{column.column}
                  </span>
                  <span
                    data-mask
                    className="text-muted-foreground/70 ml-auto shrink-0 truncate font-mono"
                  >
                    {column.type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )
    }
    case 'tool-column_values': {
      const read = columnValues(part.output)
      if (read instanceof type.errors || read.values.length === 0) {
        return null
      }
      return (
        <ul className="flex flex-col">
          {read.values.map(({ count, value }) => (
            <li
              key={valueToText(value)}
              className="flex h-6 items-center gap-1.5 text-xs"
            >
              <span data-mask className="truncate font-mono">
                {value === null ? 'NULL' : valueToText(value)}
              </span>
              <span className="text-muted-foreground/70 ml-auto shrink-0 tabular-nums">
                {count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )
    }
    default: {
      return null
    }
  }
}
