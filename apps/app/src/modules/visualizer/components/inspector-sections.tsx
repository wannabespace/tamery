import { ArrowRight01Icon, FocusPointIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { cardClass } from '@tamery/ui/components/card.utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import { Link } from '~/components/link'
import { definitionKey } from '~/core/catalog/definition-keys'
import type { DefinitionsSection } from '~/core/catalog/sections'
import { useConnectionContext } from '~/core/connection/route'
import type { indexesType } from '~/core/queries/indexes/list'
import type { policyType } from '~/core/queries/policies/list'
import type { triggersType } from '~/core/queries/triggers/list'
import { openTab } from '~/core/tabs/actions'
import { definitionsTabId } from '~/core/tabs/ids'

import { useDiagram } from '../lib/context'
import type { DiagramRelation, DiagramTable } from '../lib/schema'
import { relationMenu } from './menus'
import { draftStateClass } from './table-node'

export const Section = ({
  action,
  children,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  title: string
}) => (
  <section className="flex flex-col gap-1.5">
    <div className="flex h-6 items-center justify-between">
      <h3 className="text-2xs text-muted-foreground font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {action}
    </div>
    {children}
  </section>
)

export const List = ({ children }: { children: ReactNode }) => (
  <ul className={cn(cardClass, 'flex flex-col overflow-hidden text-xs')}>
    {children}
  </ul>
)

export const rowClass =
  'border-foreground/6 hover:bg-accent flex h-7 items-center gap-2 border-b pr-1 pl-3 last:border-b-0'

export const EmptyRow = ({ children }: { children: string }) => (
  <li className="text-muted-foreground flex h-7 items-center px-3">
    {children}
  </li>
)

export const useHoverRelation = () => {
  const { view } = useDiagram()

  return (hoveredRelationIds: string[]) =>
    view.set((state) => ({ ...state, hoveredRelationIds }))
}

export const RelationsSection = ({ table }: { table: DiagramTable }) => {
  const { actions, can, diagram } = useDiagram()
  const hoverRelation = useHoverRelation()
  const relations = diagram.relations.filter(
    (relation) =>
      relation.source.table === table.id || relation.target.table === table.id
  )
  const getTable = (id: string) =>
    diagram.tables.find((entry) => entry.id === id)
  const columnName = ({ column, table: tableId }: DiagramRelation['source']) =>
    getTable(tableId)?.columns.find((entry) => entry.id === column)?.name ??
    column

  return (
    <Section title="Relations">
      <List>
        {relations.map((relation) => {
          const outgoing = relation.source.table === table.id
          const [near, far] = outgoing
            ? [relation.source, relation.target]
            : [relation.target, relation.source]
          const menu =
            outgoing && can.dropForeignKeys
              ? relationMenu(relation, actions)
              : null
          const rowProps = {
            className: cn(
              rowClass,
              // oxlint-disable-next-line shadcn/require-static-classes -- per-row and draft-state classes on the content element AppContextMenu wraps
              relation.state && draftStateClass[relation.state]
            ),
            onMouseEnter: () => hoverRelation([relation.id]),
            onMouseLeave: () => hoverRelation([]),
          }
          const content = (
            <>
              <span data-mask className="min-w-0 flex-1 truncate font-mono">
                {columnName(near)}
                <span className="text-muted-foreground/60">
                  {outgoing ? ' → ' : ' ← '}
                </span>
                {getTable(far.table)?.name ?? far.table}.{columnName(far)}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost-muted"
                      size="icon-xs"
                      aria-label="Show relation on canvas"
                      onClick={() => actions.focusRelation(relation)}
                    />
                  }
                >
                  <HugeiconsIcon icon={FocusPointIcon} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent side="left">Show on canvas</TooltipContent>
              </Tooltip>
              {menu && <AppMenuButton variant="muted" items={menu} />}
            </>
          )

          return menu ? (
            <AppContextMenu
              key={relation.id}
              items={menu}
              render={<li {...rowProps} />}
            >
              {content}
            </AppContextMenu>
          ) : (
            <li key={relation.id} {...rowProps}>
              {content}
            </li>
          )
        })}
        {relations.length === 0 && (
          <EmptyRow>
            {can.foreignKeys
              ? 'Drag a column onto a key to link tables'
              : 'No relations'}
          </EmptyRow>
        )}
      </List>
    </Section>
  )
}

const DefinitionLink = ({
  children,
  rowKey,
  schema,
  section,
}: {
  children: ReactNode
  rowKey: string
  schema: string
  section: DefinitionsSection
}) => {
  const { connectionResource } = useConnectionContext()

  return (
    <li>
      <Link
        to="/connection/$resourceId/$tabId"
        params={{
          resourceId: connectionResource.id,
          tabId: definitionsTabId(section),
        }}
        search={{ open: rowKey, schema }}
        onClick={() =>
          openTab(connectionResource.id, definitionsTabId(section))
        }
        className={cn(rowClass, 'text-foreground group/link pr-2')}
      >
        {children}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="text-muted-foreground/50 group-hover/link:text-muted-foreground size-3 shrink-0"
        />
      </Link>
    </li>
  )
}

export const DefinitionsSections = ({
  indexes,
  policies,
  table,
  triggers,
}: {
  indexes: (typeof indexesType.infer)[]
  policies: (typeof policyType.infer)[]
  table: DiagramTable
  triggers: (typeof triggersType.infer)[]
}) => {
  const { can } = useDiagram()
  const ofTable = <T extends { schema: string; table: string }>(items: T[]) =>
    items.filter(
      (item) => item.schema === table.schema && item.table === table.table
    )

  return (
    <>
      {can.indexes && (
        <Section title="Indexes">
          <List>
            {ofTable(indexes).map((index) => (
              <DefinitionLink
                key={index.name}
                rowKey={definitionKey.index(index)}
                schema={table.schema}
                section="indexes"
              >
                <span data-mask className="min-w-0 flex-1 truncate font-mono">
                  {index.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {index.isPrimary ? 'primary' : index.isUnique && 'unique'}
                </span>
              </DefinitionLink>
            ))}
            {ofTable(indexes).length === 0 && <EmptyRow>No indexes</EmptyRow>}
          </List>
        </Section>
      )}
      {can.triggers && (
        <Section title="Triggers">
          <List>
            {ofTable(triggers).map((trigger) => (
              <DefinitionLink
                key={`${trigger.name}:${trigger.event}`}
                rowKey={definitionKey.trigger(trigger)}
                schema={table.schema}
                section="triggers"
              >
                <span data-mask className="min-w-0 flex-1 truncate font-mono">
                  {trigger.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {trigger.timing.toLowerCase()} {trigger.event.toLowerCase()}
                </span>
              </DefinitionLink>
            ))}
            {ofTable(triggers).length === 0 && <EmptyRow>No triggers</EmptyRow>}
          </List>
        </Section>
      )}
      {can.policies && (
        <Section title="Policies">
          <List>
            {ofTable(policies).map((policy) => (
              <DefinitionLink
                key={policy.name}
                rowKey={definitionKey.policy(policy)}
                schema={table.schema}
                section="policies"
              >
                <span data-mask className="min-w-0 flex-1 truncate font-mono">
                  {policy.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {policy.command.toLowerCase()}
                </span>
              </DefinitionLink>
            ))}
            {ofTable(policies).length === 0 && <EmptyRow>No policies</EmptyRow>}
          </List>
        </Section>
      )}
    </>
  )
}
