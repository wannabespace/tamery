import {
  Cancel01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ActiveFilter, FilterVia, JsonPath } from '@tamery/shared/filters'
import { Chip, ChipDivider } from '@tamery/ui/components/custom/filter-chip'
import type { ChipSegmentPart } from '@tamery/ui/components/custom/filter-chip.utils'
import { chipSegmentVariants } from '@tamery/ui/components/custom/filter-chip.utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import type { ComponentProps } from 'react'
import { useState } from 'react'

import { FiltersColumnSelector } from './filters/filters-column-selector'
import { FiltersOperatorSelector } from './filters/filters-operator-selector'
import { FiltersValueSelector } from './filters/filters-value-selector'

export const filterLabel = ({
  column,
  path = [],
  via,
}: {
  column: string
  path?: JsonPath
  via?: FilterVia
}) => (via ? `${via.table}.${via.target}` : [column, ...path].join('.'))

const ChipSegment = ({
  className,
  part,
  ...props
}: ComponentProps<'button'> & { part: ChipSegmentPart }) => (
  <button
    type="button"
    {...props}
    className={cn(
      chipSegmentVariants({ part }),
      'hover:bg-accent focus-visible:bg-accent cursor-default outline-none',
      className
    )}
  />
)

export const FilterChip = ({
  filter,
  onEdit,
  onRemove,
}: {
  filter: ActiveFilter
  onEdit: (filter: ActiveFilter) => void
  onRemove: () => void
}) => {
  const [isColumnOpen, setIsColumnOpen] = useState(false)
  const [isOperatorOpen, setIsOperatorOpen] = useState(false)
  const [isValueOpen, setIsValueOpen] = useState(false)
  const [values, setValues] = useState(filter.values)
  const toggleLabel = filter.disabled ? 'Enable filter' : 'Disable filter'
  const isValueEmpty = filter.values.every((value) => value === '')
  const isSql = filter.ref.operator === 'sql'

  return (
    <Chip>
      <Tooltip>
        <TooltipTrigger
          render={
            <ChipSegment
              aria-label={toggleLabel}
              aria-pressed={!filter.disabled}
              part="icon"
              onClick={() => onEdit({ ...filter, disabled: !filter.disabled })}
            />
          }
        >
          <HugeiconsIcon
            icon={filter.disabled ? ViewOffSlashIcon : ViewIcon}
            strokeWidth={2}
            className="size-3.5"
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
      </Tooltip>
      <ChipDivider />
      <div
        className={cn('flex items-stretch', filter.disabled && 'opacity-45')}
      >
        {isSql ? (
          <span className={chipSegmentVariants({ part: 'column' })}>SQL</span>
        ) : (
          <>
            <Popover open={isColumnOpen} onOpenChange={setIsColumnOpen}>
              <PopoverTrigger data-mask render={<ChipSegment part="column" />}>
                {filterLabel(filter)}
              </PopoverTrigger>
              <PopoverContent
                // oxlint-disable-next-line shadcn/no-restyle -- full-bleed content owns its padding
                className="gap-0 p-0"
              >
                <FiltersColumnSelector
                  onSelect={(column) => {
                    onEdit({
                      column,
                      disabled: filter.disabled,
                      ref: filter.ref,
                      values: filter.values,
                    })
                    setIsColumnOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            <ChipDivider />
            <Popover open={isOperatorOpen} onOpenChange={setIsOperatorOpen}>
              <PopoverTrigger render={<ChipSegment part="operator" />}>
                {filter.ref.label}
              </PopoverTrigger>
              <PopoverContent
                // oxlint-disable-next-line shadcn/no-restyle -- full-bleed content owns its padding
                className="gap-0 p-0"
              >
                <FiltersOperatorSelector
                  onSelect={(ref) => {
                    onEdit({ ...filter, ref })
                    setIsOperatorOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
        {filter.ref.hasValue !== false && (
          <>
            <ChipDivider />
            <Popover open={isValueOpen} onOpenChange={setIsValueOpen}>
              <PopoverTrigger data-mask render={<ChipSegment part="value" />}>
                <span className="truncate">
                  {isValueEmpty ? (
                    <span className="opacity-40">empty</span>
                  ) : (
                    filter.values.join(', ')
                  )}
                </span>
              </PopoverTrigger>
              <PopoverContent
                // oxlint-disable-next-line shadcn/no-restyle -- full-bleed content owns its padding
                className="max-h-[calc(100vh-10rem)] gap-0 p-0"
              >
                <FiltersValueSelector
                  column={isSql ? 'SQL' : filterLabel(filter)}
                  operator={filter.ref.symbol}
                  isArray={filter.ref.isArray ?? false}
                  values={values}
                  onChange={setValues}
                  onApply={() => {
                    onEdit({ ...filter, values })
                    setIsValueOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
      <ChipDivider />
      <Tooltip>
        <TooltipTrigger
          render={
            <ChipSegment
              aria-label="Remove filter"
              part="icon"
              className="hover:bg-destructive/10 hover:text-destructive"
              onClick={onRemove}
            />
          }
        >
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">Remove filter</TooltipContent>
      </Tooltip>
    </Chip>
  )
}
