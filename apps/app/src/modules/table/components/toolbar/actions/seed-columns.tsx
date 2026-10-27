import { Link01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { uppercaseFirst } from '@tamery/shared/utils'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import type { RefObject } from 'react'

import { useObjectNames } from '~/core/catalog/names'
import type { Column } from '~/core/table/cell/utils'

import type { Generators } from '../../../seeds'
import type { Generator } from '../../../seeds/registry'
import { REFERENCE_GENERATOR, SKIP_GENERATOR } from '../../../seeds/types'

const generatorLabel = (
  generator: Generator,
  column: Column,
  generators: Generators
) => {
  if (generator.generatorId === REFERENCE_GENERATOR && column.foreign) {
    return column.foreign.table
  }
  if (generator.generatorId === SKIP_GENERATOR) {
    return 'Default'
  }
  return generators[generator.generatorId]?.label ?? generator.generatorId
}

export const SeedColumns = ({
  ref,
  columns,
  columnGenerators,
  generators,
  value,
  onValueChange,
}: {
  ref: RefObject<HTMLDivElement | null>
  columns: Column[]
  columnGenerators: Record<string, Generator>
  generators: Generators
  value?: string
  onValueChange: (columnId: string) => void
}) => {
  const names = useObjectNames()
  return (
    <Command
      ref={ref}
      tabIndex={-1}
      label={`${uppercaseFirst(names.column)}s`}
      value={value}
      onValueChange={onValueChange}
      shouldFilter={false}
      disablePointerSelection
      variant="flat"
    >
      <CommandList className="scroll-fade max-h-none flex-1">
        <CommandGroup>
          {columns.map((column) => {
            const generator = columnGenerators[column.id]
            return (
              generator && (
                <CommandItem key={column.id} value={column.id}>
                  <span data-mask className="min-w-0 flex-1 truncate">
                    {column.id}
                  </span>
                  <span
                    data-mask
                    className="text-muted-foreground flex max-w-28 shrink-0 items-center gap-1 text-xs"
                  >
                    {generator.generatorId === REFERENCE_GENERATOR && (
                      <HugeiconsIcon
                        icon={Link01Icon}
                        strokeWidth={2}
                        className="size-3!"
                      />
                    )}
                    <span className="truncate">
                      {generatorLabel(generator, column, generators)}
                    </span>
                  </span>
                </CommandItem>
              )
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
