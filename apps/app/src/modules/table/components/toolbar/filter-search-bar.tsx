import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CommandPrimitive } from '@tamery/ui/components/command'
import { Chip, ChipDivider } from '@tamery/ui/components/custom/filter-chip'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { Spinner } from '@tamery/ui/components/spinner'
import { cn } from '@tamery/ui/lib/utils'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { useObjectNames } from '~/core/catalog/names'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'

import { useTableColumnsContext } from '../../lib/columns'
import { AiSummaryRow, useFilterAi } from './filter-ai'
import { FilterChip, filterLabel } from './filter-chip'
import { FilterCommandList } from './filter-command-list'
import type { Stage } from './filter-composer'
import { useFilterComposer } from './filter-composer'

const getFilterPlaceholder = ({
  isOnline,
  stage,
}: {
  isOnline: boolean
  stage: Stage
}) => {
  if (stage.step === 'operator') {
    return 'Choose an operator…'
  }
  if (stage.step === 'value') {
    return stage.ref.isArray ? 'Values, comma-separated…' : 'Value…'
  }
  if (!isOnline) {
    return 'Offline, AI unavailable'
  }
  return 'Filter or ask AI…'
}

export const FilterSearchBar = ({
  table,
  schema,
}: {
  table: string
  schema: string
}) => {
  const names = useObjectNames()
  const inputRef = useRef<HTMLInputElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const { columns } = useTableColumnsContext()
  const ai = useFilterAi({ inputRef, schema, table })
  const composer = useFilterComposer({
    busy: ai.isPending,
    inputRef,
    onQueryChange: ai.dismiss,
  })
  const {
    filters,
    highlighted,
    query,
    setFilters,
    setHighlighted,
    setQuery,
    stage,
  } = composer

  useEffect(() => {
    const chips = chipsRef.current

    if (chips && filters.length > 0) {
      chips.scrollTop = chips.scrollHeight
    }
  }, [filters.length])

  useShortcut('search', () => {
    inputRef.current?.focus()
  })

  const isOpen =
    isFocused &&
    (stage.step !== 'idle' || query.trim().length > 0 || columns.length > 0)

  return (
    <CommandPrimitive
      shouldFilter={false}
      loop
      value={highlighted}
      onValueChange={setHighlighted}
      className="relative min-w-0 flex-1"
    >
      <div className="bg-input ring-foreground/4 has-[input:focus]:focus-ring flex min-h-8 w-full items-center gap-1 rounded-xl border border-transparent py-0.75 pr-1.5 pl-2 shadow-xs ring transition-[color,box-shadow] duration-200">
        <LoadingContent
          className="pointer-events-none mr-1 size-4 shrink-0"
          loading={ai.isPending}
          spinner={<Spinner className="text-muted-foreground" />}
        >
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="text-muted-foreground size-4"
          />
        </LoadingContent>
        <div
          ref={chipsRef}
          className="scroll-fade no-scrollbar flex max-h-32 min-w-0 flex-1 flex-wrap items-center gap-1 overflow-y-auto"
        >
          {filters.map((filter, index) => (
            <FilterChip
              key={`${filter.column}-${filter.ref.operator}-${filter.values.join(',')}-${index}`}
              filter={filter}
              onEdit={(next) =>
                setFilters((current) => current.with(index, next))
              }
              onRemove={() =>
                setFilters((current) => current.toSpliced(index, 1))
              }
            />
          ))}
          {stage.step !== 'idle' && (
            <Chip>
              <span
                data-mask
                className="flex items-center px-1.5 text-xs font-medium"
              >
                {filterLabel(stage.target)}
              </span>
              {stage.step === 'value' && (
                <>
                  <ChipDivider />
                  <span className="text-muted-foreground flex items-center px-1.5 text-xs">
                    {stage.ref.symbol}
                  </span>
                </>
              )}
            </Chip>
          )}
          <CommandPrimitive.Input
            ref={inputRef}
            aria-label={`Filter ${names.row}s`}
            value={query}
            onValueChange={setQuery}
            placeholder={getFilterPlaceholder({ isOnline: ai.isOnline, stage })}
            // Read-only, not disabled: a disabled input drops focus, and Esc must still cancel the request.
            readOnly={ai.isPending}
            className="placeholder:text-muted-foreground h-6 min-w-32 flex-1 bg-transparent text-sm outline-none"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        </div>
        <span
          className={cn(
            'flex transition-opacity duration-150',
            isFocused && 'opacity-0'
          )}
        >
          <ShortcutKbd shortcut="search" />
        </span>
      </div>
      <AnimatePresence>
        {(isOpen || ai.summary) && (
          <motion.div
            key="suggestion-panel"
            role="presentation"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
            className="bg-popover ring-foreground/4 absolute top-full left-0 z-30 mt-2 w-full overflow-hidden rounded-xl shadow-lg ring-1"
            onMouseDown={(e) => e.preventDefault()}
          >
            <AnimatePresence>
              {ai.summary && (
                <AiSummaryRow hasList={isOpen} summary={ai.summary} />
              )}
            </AnimatePresence>
            {isOpen && <FilterCommandList ai={ai} composer={composer} />}
          </motion.div>
        )}
      </AnimatePresence>
    </CommandPrimitive>
  )
}
