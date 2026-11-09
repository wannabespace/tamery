import {
  ArrowRight01Icon,
  CancelCircleIcon,
  CodeIcon,
  FilterIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { FILTER_GROUPS } from '@tamery/shared/filters'
import {
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@tamery/ui/components/command'
import { EnterIcon } from '@tamery/ui/components/custom/shortcuts'
import { cn } from '@tamery/ui/lib/utils'
import { Fragment } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { getColumnKind } from '~/core/table/cell/utils'

import type { FilterAi } from './filter-ai'
import { FilterAskAiItem } from './filter-ai'
import { filterLabel } from './filter-chip'
import type { FilterComposer } from './filter-composer'
import { offeredFilters, operatorMatches } from './filter-composer'
import { useFilterTargets } from './filter-targets'

const JsonPathItem = ({
  label,
  onSelect,
}: {
  label: string
  onSelect: () => void
}) => (
  <CommandItem value={`path:${label}`} onSelect={onSelect}>
    <HugeiconsIcon icon={FilterIcon} strokeWidth={2} />
    <span data-mask className="min-w-0 flex-1 truncate">
      Filter by {label}
    </span>
    <CommandShortcut>JSON</CommandShortcut>
  </CommandItem>
)

const JsonDrillItem = ({
  label,
  onSelect,
}: {
  label: string
  onSelect: () => void
}) => (
  <CommandItem value={`keys:${label}`} onSelect={onSelect}>
    <HugeiconsIcon icon={FilterIcon} strokeWidth={2} />
    <span data-mask className="min-w-0 flex-1 truncate">
      Filter inside {label}
    </span>
    <CommandShortcut>
      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
    </CommandShortcut>
  </CommandItem>
)

export const FilterCommandList = ({
  ai,
  composer,
  rows,
}: {
  ai: FilterAi
  composer: FilterComposer
  rows: Record<string, unknown>[]
}) => {
  const {
    jsonKeys,
    matchingColumns,
    matchingRelated,
    matchingValues,
    typedPath,
  } = useFilterTargets(composer, rows)
  const { dialect } = useConnectionContext()
  const { applyValue, committedParts, filters, query, stage } = composer
  const trimmedQuery = query.trim()
  const isFreeText = trimmedQuery.length > 0 && jsonKeys.length === 0
  const matchingOperators = offeredFilters(dialect)
    .map((group) => ({
      ...group,
      filters: group.filters.filter((filter) =>
        operatorMatches(filter, trimmedQuery.toLowerCase())
      ),
    }))
    .filter((group) => group.filters.length > 0)

  return (
    <CommandList className="max-h-64">
      {stage.step === 'idle' && (
        <CommandGroup>
          {matchingColumns.map((column) => (
            <Fragment key={column.id}>
              <CommandItem
                value={`column:${column.id}`}
                onSelect={() => composer.pickColumn({ column: column.id })}
              >
                <HugeiconsIcon icon={FilterIcon} strokeWidth={2} />
                <span data-mask className="min-w-0 flex-1 truncate">
                  Filter by {column.id}
                </span>
                {column.type && (
                  <CommandShortcut>
                    {column.typeLabel || column.type}
                  </CommandShortcut>
                )}
              </CommandItem>
              {getColumnKind(dialect, column) === 'json' && (
                <JsonDrillItem
                  label={column.id}
                  onSelect={() => composer.drill(column.id)}
                />
              )}
            </Fragment>
          ))}
          {matchingRelated.map(({ column, via }) => (
            <CommandItem
              key={`${column}:${via.target}`}
              value={`related:${column}:${via.target}`}
              onSelect={() => composer.pickColumn({ column, via })}
            >
              <HugeiconsIcon icon={FilterIcon} strokeWidth={2} />
              <span data-mask className="min-w-0 flex-1 truncate">
                Filter by {filterLabel({ column, via })}
              </span>
              <CommandShortcut data-mask>via {column}</CommandShortcut>
            </CommandItem>
          ))}
          {jsonKeys.map(({ nested, target }) =>
            nested ? (
              <JsonDrillItem
                key={filterLabel(target)}
                label={filterLabel(target)}
                onSelect={() => composer.drill(filterLabel(target))}
              />
            ) : (
              <JsonPathItem
                key={filterLabel(target)}
                label={filterLabel(target)}
                onSelect={() => composer.pickColumn(target)}
              />
            )
          )}
          {typedPath && (
            <JsonPathItem
              label={filterLabel(typedPath)}
              onSelect={() => composer.pickColumn(typedPath)}
            />
          )}
          {isFreeText && isSqlDialect(dialect) && (
            <CommandItem
              value={`sql:${trimmedQuery}`}
              onSelect={() => composer.addSql(trimmedQuery)}
            >
              <HugeiconsIcon icon={CodeIcon} strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">
                Where <span data-mask>{trimmedQuery}</span>
              </span>
              <CommandShortcut>SQL</CommandShortcut>
            </CommandItem>
          )}
          {isFreeText && <FilterAskAiItem ai={ai} prompt={trimmedQuery} />}
          {trimmedQuery.length === 0 && isSqlDialect(dialect) && (
            <CommandItem value="sql" onSelect={() => composer.pickSql()}>
              <HugeiconsIcon icon={CodeIcon} strokeWidth={2} />
              Write a SQL condition
              <CommandShortcut>SQL</CommandShortcut>
            </CommandItem>
          )}
          {trimmedQuery.length === 0 && filters.length > 0 && (
            <CommandItem
              value="clear-filters"
              onSelect={() => composer.setFilters(() => [])}
            >
              <HugeiconsIcon icon={CancelCircleIcon} strokeWidth={2} />
              Clear all filters
            </CommandItem>
          )}
        </CommandGroup>
      )}
      {stage.step === 'operator' &&
        matchingOperators.map((group) => (
          <CommandGroup key={group.group} heading={FILTER_GROUPS[group.group]}>
            {group.filters.map((filter) => (
              <CommandItem
                key={filter.operator}
                value={`operator:${filter.operator}`}
                onSelect={() => composer.pickOperator(filter)}
              >
                <span className="min-w-0 flex-1 truncate">{filter.label}</span>
                <CommandShortcut>{filter.symbol}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      {stage.step === 'value' && (
        <>
          {matchingValues.length > 0 && (
            <CommandGroup heading="Suggested values">
              {matchingValues.map((value) => (
                <CommandItem
                  key={value}
                  value={`suggest:${value.toLowerCase()}`}
                  onSelect={() => composer.pickValue(value)}
                >
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className={cn(
                      'size-4',
                      committedParts.includes(value)
                        ? 'text-foreground'
                        : 'opacity-0'
                    )}
                  />
                  <span data-mask className="min-w-0 flex-1 truncate">
                    {value}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup>
            <CommandItem
              value="apply-value"
              disabled={stage.ref.operator === 'sql' && query.trim() === ''}
              onSelect={applyValue}
            >
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
              <span data-mask className="min-w-0 flex-1 truncate">
                Apply:{' '}
                {[filterLabel(stage.target), stage.ref.symbol]
                  .filter(Boolean)
                  .join(' ')}{' '}
                {query === '' ? '(empty)' : query}
              </span>
              <CommandShortcut>
                <EnterIcon />
              </CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </>
      )}
    </CommandList>
  )
}
