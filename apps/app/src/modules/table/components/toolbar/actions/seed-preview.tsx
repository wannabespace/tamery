import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { isOperationNodeSource } from 'kysely'
import { useState } from 'react'

import { getValueForEditor } from '~/core/connection/utils'
import type { Column } from '~/core/table/cell/utils'

import { generateRows } from '../../../seeds'
import type { Generator, GeneratorId } from '../../../seeds/registry'
import {
  SQL_EXPRESSION_GENERATOR,
  REFERENCE_GENERATOR,
  SKIP_GENERATOR,
} from '../../../seeds/types'

const PREVIEW_ROWS = 3

const previewText = (value: unknown) => {
  if (value === null) {
    return 'NULL'
  }
  if (isOperationNodeSource(value)) {
    return 'SQL'
  }
  return getValueForEditor(value).replaceAll('\n', ' ')
}

const previewNote = (column: Column, generatorId: GeneratorId) => {
  if (generatorId === SKIP_GENERATOR) {
    return 'Left out of the insert. The database fills it in.'
  }
  if (generatorId === REFERENCE_GENERATOR && column.foreign) {
    return `A random ${column.foreign.column} from ${column.foreign.schema}.${column.foreign.table}`
  }
  if (generatorId === SQL_EXPRESSION_GENERATOR) {
    return 'Inserted verbatim as SQL, once per row.'
  }
}

export const SeedPreview = ({
  column,
  generator,
  dialect,
}: {
  column: Column
  generator: Generator
  dialect: Dialect
}) => {
  const note = previewNote(column, generator.generatorId)
  const sample = () =>
    note
      ? []
      : generateRows({
          columnGenerators: { [column.id]: generator },
          columns: [column],
          count: PREVIEW_ROWS,
          dialect,
        }).map((row) => row[column.id])
  const [values, setValues] = useState(sample)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-6 shrink-0 items-center justify-between">
        <span className="text-muted-foreground text-2xs font-semibold tracking-wider uppercase">
          Preview
        </span>
        {!note && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  onClick={() => setValues(sample)}
                />
              }
            >
              <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>Regenerate</TooltipContent>
          </Tooltip>
        )}
      </div>
      {note ? (
        <p data-mask className="text-muted-foreground text-xs">
          {note}
        </p>
      ) : (
        <ul data-mask className="flex flex-col gap-1">
          {values.map((value, index) => (
            <li key={index} className="truncate font-mono text-xs">
              {previewText(value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
