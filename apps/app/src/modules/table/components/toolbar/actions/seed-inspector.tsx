import type { Dialect } from '@tamery/shared/enums/connection-type'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { Input } from '@tamery/ui/components/input'
import { Switch } from '@tamery/ui/components/switch'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useEffect, useRef, useState } from 'react'

import type { Column } from '~/core/table/cell/utils'

import type { GeneratorGroup, Generators } from '../../../seeds'
import { isGeneratorAvailable } from '../../../seeds'
import type { Generator, GeneratorId } from '../../../seeds/registry'
import {
  SQL_EXPRESSION_GENERATOR,
  NULL_GENERATOR,
  SKIP_GENERATOR,
} from '../../../seeds/types'
import { ColumnType } from '../../table/column-type'
import { SeedPreview } from './seed-preview'

const GeneratorPicker = ({
  column,
  generator,
  generators,
  groups,
  dialect,
  inputRef,
  onChange,
  onLeave,
}: {
  column: Column
  generator: Generator
  generators: Generators
  groups: GeneratorGroup[]
  dialect: Dialect
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (id: GeneratorId) => void
  onLeave: () => void
}) => {
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLDivElement>(null)
  const getLabel = (id: GeneratorId) => generators[id]?.label ?? id

  useEffect(() => {
    const list = listRef.current
    const item = currentRef.current
    // not scrollIntoView: it also scrolls every ancestor, jerking the sliding drawer
    if (list && item) {
      list.scrollTop =
        item.getBoundingClientRect().top - list.getBoundingClientRect().top
    }
  }, [])

  useHotkeys(
    [
      {
        callback: (event) => {
          event.preventDefault()
          event.stopPropagation()

          if (search) {
            setSearch('')
            return
          }

          onLeave()
        },
        hotkey: 'Escape',
      },
      {
        callback: (event) => {
          const input = inputRef.current
          const caretAtStart =
            input?.selectionStart === 0 && input?.selectionEnd === 0

          if (caretAtStart) {
            event.preventDefault()
            onLeave()
          }
        },
        hotkey: 'ArrowLeft',
      },
    ],
    { target: inputRef }
  )

  return (
    <Command
      defaultValue={generator.generatorId}
      filter={(_id, term, keywords) =>
        (keywords?.[0] ?? '').toLowerCase().includes(term.toLowerCase()) ? 1 : 0
      }
      variant="flat"
      className="min-h-0 flex-1"
    >
      <CommandInput
        ref={inputRef}
        variant="flat"
        placeholder="Search generators…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList ref={listRef} className="max-h-none min-h-0 flex-1">
        <CommandEmpty>No generators found.</CommandEmpty>
        {groups.map((group) => {
          const items = group.items.filter((id) =>
            isGeneratorAvailable(id, column, dialect)
          )
          return (
            items.length > 0 && (
              <CommandGroup key={group.value} heading={group.value}>
                {items.map((id: GeneratorId) => (
                  <CommandItem
                    key={id}
                    ref={id === generator.generatorId ? currentRef : undefined}
                    value={id}
                    keywords={[getLabel(id)]}
                    data-checked={id === generator.generatorId}
                    onSelect={() => onChange(id)}
                  >
                    <HighlightText text={getLabel(id)} match={search} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          )
        })}
      </CommandList>
    </Command>
  )
}

export const SeedInspector = ({
  column,
  generator,
  generators,
  groups,
  dialect,
  inputRef,
  onChange,
  onLeave,
}: {
  column: Column
  generator: Generator
  generators: Generators
  groups: GeneratorGroup[]
  dialect: Dialect
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (patch: Partial<Generator>) => void
  onLeave: () => void
}) => {
  const canRandomizeNulls =
    column.isNullable &&
    generator.generatorId !== NULL_GENERATOR &&
    generator.generatorId !== SKIP_GENERATOR

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b px-3">
        <span data-mask className="truncate text-sm font-medium">
          {column.id}
        </span>
        <div className="ml-auto min-w-0">
          <ColumnType column={column} />
        </div>
      </div>
      <GeneratorPicker
        column={column}
        generator={generator}
        generators={generators}
        groups={groups}
        dialect={dialect}
        inputRef={inputRef}
        onChange={(generatorId) => onChange({ generatorId })}
        onLeave={onLeave}
      />
      <div className="flex shrink-0 flex-col gap-3 border-t p-3">
        {generator.generatorId === SQL_EXPRESSION_GENERATOR && (
          <Input
            data-mask
            aria-label="SQL expression"
            placeholder="now()"
            variant="code"
            value={generator.customExpression ?? ''}
            onChange={(event) =>
              onChange({ customExpression: event.target.value })
            }
          />
        )}
        {canRandomizeNulls && (
          <label
            htmlFor="seed-randomize-nulls"
            className="flex items-center justify-between gap-3 border-b pb-3 text-sm"
          >
            Randomize NULL values
            <Switch
              id="seed-randomize-nulls"
              size="sm"
              checked={generator.isNullable}
              onCheckedChange={(checked) => onChange({ isNullable: checked })}
            />
          </label>
        )}
        <SeedPreview
          key={`${generator.generatorId}:${generator.isNullable}`}
          column={column}
          generator={generator}
          dialect={dialect}
        />
      </div>
    </div>
  )
}
