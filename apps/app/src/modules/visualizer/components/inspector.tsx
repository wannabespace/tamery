import {
  Cancel01Icon,
  Key01Icon,
  Link01Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import { Skeleton } from '@tamery/ui/components/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import type { ComponentProps } from 'react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import { useConnectionContext } from '~/core/connection/route'
import type { indexesType } from '~/core/queries/indexes/list'
import type { policyType } from '~/core/queries/policies/list'
import { resourceTableTotalQueryOptions } from '~/core/queries/rows/total'
import type { triggersType } from '~/core/queries/triggers/list'

import { useDiagram } from '../lib/context'
import type { DiagramColumn, DiagramTable } from '../lib/schema'
import {
  DefinitionsSections,
  EmptyRow,
  List,
  RelationsSection,
  Section,
  rowClass,
  useHoverRelation,
} from './inspector-sections'
import { columnMenu, tableMenu } from './menus'
import { NotesSection } from './notes-section'
import { draftStateClass } from './table-node'

const noFilters: never[] = []

const ColumnItem = ({
  column,
  table,
}: {
  column: DiagramColumn
  table: DiagramTable
}) => {
  const { actions, can, diagram } = useDiagram()
  const hoverRelation = useHoverRelation()
  const relationIds = diagram.relations
    .filter(
      ({ source, target }) =>
        (source.table === table.id && source.column === column.id) ||
        (target.table === table.id && target.column === column.id)
    )
    .map(({ id }) => id)
  const menu = () => columnMenu(table, column, { actions, can, diagram })

  return (
    <AppContextMenu
      items={menu}
      render={
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <li
          className={
            // oxlint-disable-next-line shadcn/require-static-classes -- per-row and draft-state classes on the content element AppContextMenu wraps
            cn(rowClass, column.state && draftStateClass[column.state])
          }
          onMouseEnter={() => hoverRelation(relationIds)}
          onMouseLeave={() => hoverRelation([])}
        />
      }
    >
      {column.primaryKey && (
        <HugeiconsIcon
          icon={Key01Icon}
          strokeWidth={2}
          className="text-primary size-3 shrink-0"
        />
      )}
      {!column.primaryKey && column.foreign && (
        <HugeiconsIcon
          icon={Link01Icon}
          strokeWidth={2}
          className="text-muted-foreground/70 size-3 shrink-0"
        />
      )}
      <span data-mask className="min-w-0 flex-1 truncate font-mono">
        {column.name}
      </span>
      <span
        data-mask
        className="text-muted-foreground max-w-[40%] truncate font-mono"
      >
        {column.label}
        {column.nullable && '?'}
      </span>
      {table.kind === 'table' && <AppMenuButton variant="muted" items={menu} />}
    </AppContextMenu>
  )
}

const RowCount = ({ table }: { table: DiagramTable }) => {
  const { connectionResource } = useConnectionContext()
  const { data, isPending } = useQuery({
    ...resourceTableTotalQueryOptions({
      connectionResource,
      query: { exact: false, filters: noFilters },
      schema: table.schema,
      table: table.table,
    }),
    enabled: table.state !== 'added',
  })

  if (table.state === 'added') {
    return null
  }

  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs tabular-nums">
      {isPending || !data ? (
        <Skeleton className="h-3 w-12" />
      ) : (
        <>
          {data.isEstimated && '~'}
          <NumberFlow value={data.count} />
        </>
      )}{' '}
      {data?.count === 1 ? 'row' : 'rows'}
    </span>
  )
}

const Inspector = ({
  indexes,
  onClose,
  policies,
  table,
  triggers,
}: {
  indexes: (typeof indexesType.infer)[]
  onClose: () => void
  policies: (typeof policyType.infer)[]
  table: DiagramTable
  triggers: (typeof triggersType.infer)[]
}) => {
  const { actions, can } = useDiagram()
  const editable = table.kind === 'table' && table.state !== 'dropped'
  const menuOfTable = () => tableMenu(table, can, actions)

  return (
    <div className="flex h-full flex-col">
      <AppContextMenu
        items={menuOfTable}
        render={
          <header className="flex h-11 shrink-0 items-center gap-1 pr-2 pl-4" />
        }
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            data-mask
            className={cn(
              'truncate text-sm font-medium',
              table.state === 'dropped' && 'line-through'
            )}
          >
            {table.name}
          </span>
          <span data-mask className="text-2xs text-muted-foreground truncate">
            {table.kind} · {table.schema}
          </span>
        </div>
        <RowCount table={table} />
        <AppMenuButton variant="muted" items={menuOfTable} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label="Close inspector"
                onClick={onClose}
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent side="bottom">Close</TooltipContent>
        </Tooltip>
      </AppContextMenu>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <Section
          title="Columns"
          action={
            editable && (
              <Button
                variant="ghost-muted"
                size="xs"
                onClick={() => actions.addColumn(table)}
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Add
              </Button>
            )
          }
        >
          <List>
            {table.columns.map((column) => (
              <ColumnItem key={column.id} column={column} table={table} />
            ))}
            {table.columns.length === 0 && <EmptyRow>No columns yet</EmptyRow>}
          </List>
        </Section>
        <NotesSection table={table} />
        <RelationsSection table={table} />
        <DefinitionsSections
          indexes={indexes}
          policies={policies}
          table={table}
          triggers={triggers}
        />
      </div>
    </div>
  )
}

export const InspectorPane = ({
  onClose,
  table,
  ...definitions
}: Omit<ComponentProps<typeof Inspector>, 'table'> & {
  table: DiagramTable | null
}) => (
  <AnimatePresence initial={false}>
    {table && (
      <motion.aside
        key="inspector"
        initial={{ width: 0 }}
        animate={{ width: 'auto' }}
        exit={{ width: 0 }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className="border-foreground/6 bg-background shrink-0 overflow-hidden border-l"
      >
        <div className="h-full w-80">
          <Inspector
            key={table.id}
            table={table}
            onClose={onClose}
            {...definitions}
          />
        </div>
      </motion.aside>
    )}
  </AnimatePresence>
)
