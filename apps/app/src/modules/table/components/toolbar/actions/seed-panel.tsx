import { CrownIcon, SproutIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import { DrawerClose, DrawerFooter } from '@tamery/ui/components/drawer'
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@tamery/ui/components/number-field'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { resourceRowsQueryKey } from '~/core/queries/rows/list'
import { resourceTableTotalQueryKey } from '~/core/queries/rows/total'
import { checkOrUpgrade } from '~/core/user/permissions'
import { useIsAnonymous } from '~/lib/auth'
import { queryClient } from '~/lib/query-client'
import { plural } from '~/utils/plural'

import { useTableColumnsContext } from '../../../lib/columns'
import { useTablePageStore } from '../../../lib/store'
import {
  autoDetectGenerator,
  getGeneratorGroups,
  getGenerators,
  isGeneratorAvailable,
} from '../../../seeds'
import { insertSeedRows } from '../../../seeds/insert'
import type { Generator } from '../../../seeds/registry'
import { CUSTOM_GENERATOR, SKIP_GENERATOR } from '../../../seeds/types'
import {
  FREE_SEED_LIMIT,
  incrementSeedUsage,
  useSeedQuota,
} from '../../../seeds/usage'
import { SeedColumns } from './seed-columns'
import { SeedInspector } from './seed-inspector'

const MAX_SEED_ROWS = 10_000

export const SeedPanel = ({
  table,
  schema,
  onOpenChange,
}: {
  table: string
  schema: string
  onOpenChange: (open: boolean) => void
}) => {
  const names = useObjectNames()
  const { columns } = useTableColumnsContext()
  const { connectionResource, dialect } = useConnectionContext()
  const generators = getGenerators(dialect)
  const groups = getGeneratorGroups(dialect)
  const store = useTablePageStore()
  const seedsCount = useSubscription(store, {
    selector: (state) => state.seedsCount,
  })
  const savedGenerators = useSubscription(store, {
    selector: (state) => state.generators,
  })
  const [selectedId, setSelectedId] = useState<string>()
  const selectedColumn =
    columns.find((column) => column.id === selectedId) ?? columns[0]
  const columnsRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    columnsRef.current?.focus({ preventScroll: true })
  }, [])

  const { hasReachedLimit, remaining, unlimited } = useSeedQuota()
  const isGuest = useIsAnonymous()

  const columnGenerators = Object.fromEntries(
    columns.map((column): [string, Generator] => {
      const saved = savedGenerators[column.id]
      const isValid =
        saved &&
        saved.generatorId in generators &&
        isGeneratorAvailable(saved.generatorId, column, dialect)
      return [
        column.id,
        isValid
          ? saved
          : {
              generatorId: autoDetectGenerator(column, dialect),
              isNullable: true,
            },
      ]
    })
  )
  const selectedGenerator =
    selectedColumn && columnGenerators[selectedColumn.id]

  const updateGenerator = (columnId: string, generator: Generator) =>
    store.set(
      (state) =>
        ({
          ...state,
          generators: { ...state.generators, [columnId]: generator },
        }) satisfies typeof state
    )

  useHotkeys(
    [
      { callback: () => searchRef.current?.focus(), hotkey: 'ArrowRight' },
      { callback: () => searchRef.current?.focus(), hotkey: 'Enter' },
    ],
    { preventDefault: true, target: columnsRef }
  )

  const activeGenerators = Object.values(columnGenerators).filter(
    (generator) => generator.generatorId !== SKIP_GENERATOR
  )
  const hasEmptyExpression = activeGenerators.some(
    (generator) =>
      generator.generatorId === CUSTOM_GENERATOR &&
      !generator.customExpression?.trim()
  )
  const canSeed =
    activeGenerators.length > 0 && !hasEmptyExpression && !hasReachedLimit

  const { mutate: seed, isPending } = useMutation({
    meta: { event: 'table_seeded' },
    mutationFn: () =>
      insertSeedRows({
        columnGenerators,
        columns,
        connectionResource,
        count: seedsCount,
        dialect,
        schema,
        table,
      }),
    onError: (error) => {
      toast.error('Failed to seed data', { description: error.message })
    },
    onSuccess: () => {
      if (!unlimited) {
        incrementSeedUsage()
      }
      toast.success(
        `Seeded ${plural(seedsCount, names.row)} into ${schema}.${table}`
      )
      queryClient.invalidateQueries({
        queryKey: resourceRowsQueryKey({ connectionResource, schema, table }),
      })
      queryClient.invalidateQueries({
        queryKey: resourceTableTotalQueryKey({
          connectionResource,
          schema,
          table,
        }),
      })
      onOpenChange(false)
    },
  })

  useShortcut('submit', () => seed(), { enabled: canSeed && !isPending })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col border-r">
          <SeedColumns
            ref={columnsRef}
            columns={columns}
            columnGenerators={columnGenerators}
            generators={generators}
            value={selectedColumn?.id}
            onValueChange={setSelectedId}
          />
        </div>
        {selectedColumn && selectedGenerator && (
          <SeedInspector
            key={selectedColumn.id}
            inputRef={searchRef}
            onLeave={() => columnsRef.current?.focus()}
            column={selectedColumn}
            generator={selectedGenerator}
            generators={generators}
            groups={groups}
            dialect={dialect}
            onChange={(patch) =>
              updateGenerator(selectedColumn.id, {
                ...selectedGenerator,
                ...patch,
              })
            }
          />
        )}
      </div>
      <DrawerFooter>
        <NumberField
          min={1}
          max={MAX_SEED_ROWS}
          value={seedsCount}
          onValueChange={(value) =>
            store.set(
              (state) =>
                ({
                  ...state,
                  seedsCount: Math.max(1, Math.min(MAX_SEED_ROWS, value ?? 1)),
                }) satisfies typeof state
            )
          }
          className="w-28"
        >
          <NumberFieldGroup>
            <NumberFieldDecrement />
            <NumberFieldInput />
            <NumberFieldIncrement />
          </NumberFieldGroup>
        </NumberField>
        {!unlimited && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground tabular-nums">
              {remaining} of {FREE_SEED_LIMIT} free runs
            </span>
            <Button
              variant="link"
              size="xs"
              className={isGuest ? 'opacity-50' : undefined}
              onClick={() => checkOrUpgrade('seed.unlimited')}
            >
              Upgrade
            </Button>
          </div>
        )}
        <DrawerClose render={<Button variant="outline" className="ml-auto" />}>
          Cancel
        </DrawerClose>
        <Tooltip
          shortcut={canSeed && !isPending && <ShortcutKbd shortcut="submit" />}
        >
          <TooltipTrigger
            render={
              <Button
                onClick={() =>
                  hasReachedLimit ? checkOrUpgrade('seed.unlimited') : seed()
                }
                disabled={isPending || (!canSeed && !hasReachedLimit)}
                className={
                  isGuest && hasReachedLimit ? 'opacity-50' : undefined
                }
              />
            }
          >
            <LoadingContent loading={isPending}>
              <HugeiconsIcon
                icon={hasReachedLimit ? CrownIcon : SproutIcon}
                strokeWidth={2}
              />
              {hasReachedLimit ? (
                'Upgrade to seed'
              ) : (
                <NumberFlow
                  value={seedsCount}
                  className="tabular-nums"
                  prefix="Seed "
                  suffix={seedsCount === 1 ? ' row' : ' rows'}
                />
              )}
            </LoadingContent>
          </TooltipTrigger>
          <TooltipContent>Seed {names.row}s</TooltipContent>
        </Tooltip>
      </DrawerFooter>
    </div>
  )
}
