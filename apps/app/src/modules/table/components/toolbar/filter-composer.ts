import type { Dialect } from '@tamery/shared/enums/connection-type'
import type { ActiveFilter, Filter } from '@tamery/shared/filters'
import { FILTERS_GROUPED } from '@tamery/shared/filters'
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { RefObject } from 'react'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'

import { tableGridRef } from '../../lib/grid-ref'
import { useTablePageStore } from '../../lib/store'

export type FilterTarget = Pick<ActiveFilter, 'column' | 'via'>

export type Stage =
  | { step: 'idle' }
  | { step: 'operator'; target: FilterTarget }
  | { step: 'value'; target: FilterTarget; ref: Filter }

export const offeredFilters = (dialect: Dialect) =>
  FILTERS_GROUPED.map((group) => ({
    ...group,
    filters: group.filters.filter(
      (filter) =>
        filter.operator !== 'ilike' ||
        getCapabilities(dialect).flags.includes('ilike')
    ),
  }))

export const operatorMatches = (filter: Filter, text: string) =>
  filter.label.toLowerCase().includes(text) ||
  filter.symbol.toLowerCase().includes(text)

const highlightForStage = (dialect: Dialect, stage: Stage, value: string) => {
  const trimmed = value.trim().toLowerCase()
  if (stage.step === 'operator') {
    const first = offeredFilters(dialect)
      .flatMap((group) => group.filters)
      .find((filter) => operatorMatches(filter, trimmed))
    return first ? `operator:${first.operator}` : ''
  }
  if (stage.step === 'value') {
    return 'apply-value'
  }
  return trimmed ? `ai:${trimmed}` : ''
}

export type FilterComposer = ReturnType<typeof useFilterComposer>

export const useFilterComposer = ({
  busy,
  inputRef,
  onQueryChange,
}: {
  busy: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onQueryChange: () => void
}) => {
  const { dialect } = useConnectionContext()
  const store = useTablePageStore()
  const filters = useSubscription(store, {
    selector: (state) => state.filters,
  })
  const query = useSubscription(store, { selector: (state) => state.prompt })
  const [stage, setStage] = useState<Stage>({ step: 'idle' })
  const [highlighted, setHighlighted] = useState('')

  const setPrompt = (value: string) =>
    store.set((state) => ({ ...state, prompt: value }) satisfies typeof state)

  const setQuery = (value: string) => {
    setPrompt(value)
    setHighlighted(highlightForStage(dialect, stage, value))
    onQueryChange()
  }

  const setFilters = (updater: (filters: ActiveFilter[]) => ActiveFilter[]) =>
    store.set(
      (state) =>
        ({ ...state, filters: updater(state.filters) }) satisfies typeof state
    )

  const focus = () => inputRef.current?.focus()

  const add = (target: FilterTarget, ref: Filter, values: unknown[]) => {
    setFilters((current) => [...current, { ...target, ref, values }])
    setStage({ step: 'idle' })
    setHighlighted('')
    setPrompt('')
    focus()
  }

  const isArrayValue = stage.step === 'value' && stage.ref.isArray
  const parts = isArrayValue ? query.split(',').map((part) => part.trim()) : []
  const committedParts = parts.filter((part) => part !== '')
  const valueFilterText = isArrayValue ? (parts.at(-1) ?? '') : query.trim()

  const stepBack = () =>
    setStage(
      stage.step === 'value'
        ? { step: 'operator', target: stage.target }
        : { step: 'idle' }
    )

  useHotkeys(
    [
      {
        callback: () =>
          stage.step === 'idle'
            ? setFilters((current) => current.slice(0, -1))
            : stepBack(),
        hotkey: 'Backspace',
        options: {
          enabled:
            query === '' && (stage.step !== 'idle' || filters.length > 0),
        },
      },
      {
        callback: () => {
          if (query !== '') {
            setQuery('')
          } else if (stage.step === 'idle') {
            inputRef.current?.blur()
            tableGridRef.current?.focus()
          } else {
            stepBack()
          }
        },
        hotkey: 'Escape',
        options: { enabled: !busy },
      },
    ],
    { target: inputRef }
  )

  return {
    applyValue: () => {
      if (stage.step === 'value') {
        add(stage.target, stage.ref, isArrayValue ? committedParts : [query])
      }
    },
    committedParts,
    filters,
    highlighted,
    pickColumn: (target: FilterTarget) => {
      setStage({ step: 'operator', target })
      setPrompt('')
      setHighlighted('operator:eq')
      focus()
    },
    pickOperator: (ref: Filter) => {
      if (stage.step !== 'operator') {
        return
      }
      if (ref.hasValue === false) {
        add(stage.target, ref, [])
        return
      }
      setStage({ ...stage, ref, step: 'value' })
      setHighlighted('apply-value')
      setPrompt('')
      focus()
    },
    pickValue: (value: string) => {
      if (stage.step !== 'value') {
        return
      }
      if (!isArrayValue) {
        add(stage.target, stage.ref, [value])
        return
      }
      const committed = valueFilterText
        ? committedParts.slice(0, -1)
        : committedParts
      setQuery(
        (committed.includes(value)
          ? committed.filter((part) => part !== value)
          : [...committed, value]
        ).join(', ')
      )
      focus()
    },
    query,
    setFilters,
    setHighlighted,
    setQuery,
    stage,
    valueFilterText,
  }
}
