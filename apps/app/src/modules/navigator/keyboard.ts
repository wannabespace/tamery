import type {
  HotkeyCallback,
  UseHotkeyDefinition,
  UseHotkeyOptions,
} from '@tanstack/react-hotkeys'
import { useHotkey, useHotkeys } from '@tanstack/react-hotkeys'
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { navigatorOpenValue } from './stores'

let mountedSearch: HTMLInputElement | null = null

export const focusSearchAfter = (update: () => void) => {
  flushSync(update)
  mountedSearch?.focus()
}

const unlessComposing =
  (handler: HotkeyCallback): HotkeyCallback =>
  (event, context) => {
    if (!event.isComposing) {
      handler(event, context)
    }
  }

const useHotkeysUnlessComposing = (
  definitions: UseHotkeyDefinition[],
  options: UseHotkeyOptions
) =>
  useHotkeys(
    definitions.map((definition) => ({
      ...definition,
      callback: unlessComposing(definition.callback),
    })),
    options
  )

// Must stay on window: base-ui popups and scoped hotkeys stop a consumed Escape at the document, so only an unconsumed one arrives here.
export const useEscapeToNavigator = (enabled: boolean) =>
  useHotkey(
    'Escape',
    unlessComposing((event) => {
      if (!event.defaultPrevented) {
        focusSearchAfter(() => navigatorOpenValue.set(true))
      }
    }),
    { enabled, preventDefault: false, target: window }
  )

const claimsCaretEdge = (event: KeyboardEvent, edge: 'start' | 'end') => {
  const input = event.target
  const atEdge =
    input instanceof HTMLInputElement &&
    input.selectionStart === input.selectionEnd &&
    input.selectionStart === (edge === 'start' ? 0 : input.value.length)
  if (atEdge) {
    event.preventDefault()
  }
  return atEdge
}

export const useNavigatorSearch = ({
  activeId,
  nodes,
  search,
  onBack,
  onClear,
}: {
  activeId?: string
  /** `open` marks an expanded row whose children follow it directly. */
  nodes: { id: string; open?: boolean }[]
  search: string
  onBack?: () => void
  onClear: () => void
}) => {
  const searchRef = useRef<HTMLInputElement>(null)
  const highlightedControlId = useId()
  const listId = useId()
  const [focused, setFocused] = useState(false)
  const [moved, setMoved] = useState<{
    activeId?: string
    id: string
    search: string
  } | null>(null)
  const ids = nodes.map(({ id }) => id)
  const fallback =
    !search && activeId && ids.includes(activeId)
      ? activeId
      : (nodes.find(({ open }) => !open)?.id ?? ids[0])
  const highlighted =
    moved?.search === search &&
    moved.activeId === activeId &&
    ids.includes(moved.id)
      ? moved.id
      : fallback
  const index = nodes.findIndex((candidate) => candidate.id === highlighted)
  const node = nodes[index]

  // A virtualized list must keep the highlighted row rendered, or Enter and ⌘. find nothing.
  const highlightedControl = () =>
    document.querySelector<HTMLElement>(`#${CSS.escape(highlightedControlId)}`)

  const highlight = (id: string) => setMoved({ activeId, id, search })

  const move = (delta: number) => {
    const next = ids[Math.min(ids.length - 1, Math.max(0, index + delta))]
    if (next) {
      highlight(next)
    }
  }

  useHotkeysUnlessComposing(
    [
      { callback: () => move(1), hotkey: 'ArrowDown' },
      { callback: () => move(-1), hotkey: 'ArrowUp' },
      {
        callback: (event) => {
          if (!claimsCaretEdge(event, 'end')) {
            return
          }
          if (node?.open) {
            move(1)
          } else {
            highlightedControl()?.click()
          }
        },
        hotkey: 'ArrowRight',
        options: { preventDefault: false },
      },
      {
        callback: (event) => {
          if (!claimsCaretEdge(event, 'start')) {
            return
          }
          const parent = nodes.slice(0, index).findLast(({ open }) => open)
          if (node?.open) {
            highlightedControl()?.click()
          } else if (parent) {
            highlight(parent.id)
          } else if (onBack) {
            focusSearchAfter(onBack)
          }
        },
        hotkey: 'ArrowLeft',
        options: { preventDefault: false },
      },
      { callback: () => highlightedControl()?.click(), hotkey: 'Enter' },
      { callback: onClear, hotkey: 'Escape', options: { enabled: !!search } },
    ],
    { target: searchRef }
  )
  const highlightedId = focused ? highlighted : undefined

  return {
    highlightedControlId,
    highlightedId,
    listId,
    searchProps: {
      'aria-activedescendant': highlightedId && highlightedControlId,
      'aria-controls': listId,
      'aria-expanded': true,
      onBlur: () => setFocused(false),
      onFocus: () => setFocused(true),
      ref: (input: HTMLInputElement) => {
        searchRef.current = input
        mountedSearch = input
        if (document.activeElement === document.body) {
          input.focus({ preventScroll: true })
        }
        return () => {
          if (mountedSearch === input) {
            mountedSearch = null
          }
        }
      },
      role: 'combobox',
    },
  }
}
