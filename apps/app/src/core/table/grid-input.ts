import { useHotkeys } from '@tanstack/react-hotkeys'
import type { MouseEvent, PointerEvent, RefObject } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { openContextMenuOn } from '~/components/app-context-menu'
import { useShortcuts } from '~/core/keyboard/use-shortcuts'
import { useTypedCharacter } from '~/core/keyboard/use-typed-character'

import type { CellPosition, GridCursor } from './cursor'
import { inRange } from './cursor'

const TO_EDGE = Number.MAX_SAFE_INTEGER

const getPosition = (event: MouseEvent): CellPosition | null => {
  const cell =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-cell]')
      : null
  return cell?.dataset.column === undefined
    ? null
    : { column: cell.dataset.column, row: Number(cell.dataset.row) }
}

const isCheckbox = (event: MouseEvent) =>
  event.target instanceof Element &&
  !!event.target.closest('[data-slot="checkbox"]')

export const useGridHotkeys = ({
  canEdit,
  cursor,
  onExtendRows,
  onToggleRows,
  scrollRef,
  scrollToCursor,
}: {
  canEdit: boolean
  cursor: GridCursor
  onExtendRows?: (direction: 'up' | 'down') => void
  onToggleRows?: (rowIndexes: number[]) => void
  scrollRef: RefObject<HTMLDivElement | null>
  scrollToCursor: () => void
}) => {
  const hasCursor = useSubscription(cursor.store, {
    selector: (state) => state.cursor !== null,
  })
  const isEditing = useSubscription(cursor.store, {
    selector: (state) => state.edit !== null,
  })
  const hasBlock = useSubscription(cursor.store, {
    selector: (state) => state.anchor !== null,
  })
  const [gridFocused, setGridFocused] = useState(false)
  const ownsKeys = gridFocused && !isEditing
  const navigating = ownsKeys && hasCursor

  // Listens on document: switching Grid ↔ Documents swaps the scroller element behind the same ref.
  const track = useEffectEvent(() => {
    const focused = document.activeElement === scrollRef.current
    setGridFocused(focused)
    if (focused && !cursor.store.get().cursor) {
      cursor.step(0, 0)
    }
  })
  useTypedCharacter((event) => {
    if (navigating) {
      event.preventDefault()
      cursor.edit(event.key)
    }
  })
  useEffect(() => {
    document.addEventListener('focusin', track)
    document.addEventListener('focusout', track)
    return () => {
      document.removeEventListener('focusin', track)
      document.removeEventListener('focusout', track)
    }
  }, [])

  // A far edge is virtualized away, so the cursor's own glide finds no cell to scroll to.
  const jumpToEdge = (down: number, right: number, extend?: boolean) => {
    cursor.step(down * TO_EDGE, right * TO_EDGE, extend)
    scrollToCursor()
  }

  useHotkeys(
    [
      ...(
        [
          ['ArrowUp', -1, 0],
          ['ArrowDown', 1, 0],
          ['ArrowLeft', 0, -1],
          ['ArrowRight', 0, 1],
        ] as const
      ).flatMap(([hotkey, down, right]) => [
        {
          callback: () => cursor.step(down, right),
          hotkey,
          options: { enabled: ownsKeys },
        },
        {
          callback: () => jumpToEdge(down, right),
          hotkey: `Mod+${hotkey}` as const,
          options: { enabled: ownsKeys },
        },
        {
          callback: () => jumpToEdge(down, right, true),
          hotkey: `Mod+Shift+${hotkey}` as const,
          options: { enabled: ownsKeys },
        },
        {
          callback: () => {
            if (hasCursor) {
              cursor.step(down, right, true)
            } else if (down !== 0) {
              onExtendRows?.(down > 0 ? 'down' : 'up')
            }
          },
          hotkey: `Shift+${hotkey}` as const,
          options: { enabled: ownsKeys },
        },
      ]),
      ...(['Backspace', 'Delete'] as const).map((hotkey) => ({
        callback: () => cursor.edit(''),
        hotkey,
        options: { enabled: navigating },
      })),
      {
        callback: cursor.collapse,
        hotkey: 'Escape',
        options: { enabled: navigating && hasBlock },
      },
    ],
    { target: scrollRef }
  )
  useShortcuts(
    [
      {
        callback: () => cursor.edit(),
        options: { enabled: navigating },
        shortcut: 'editCell',
      },
      {
        callback: cursor.copy,
        options: { enabled: navigating, ignoreInputs: true },
        shortcut: 'copy',
      },
      {
        callback: async () =>
          cursor.paste(await navigator.clipboard.readText()),
        options: { enabled: navigating && canEdit, ignoreInputs: true },
        shortcut: 'paste',
      },
      {
        callback: cursor.fillDown,
        options: { enabled: navigating && canEdit },
        shortcut: 'fillDown',
      },
      {
        callback: cursor.preview,
        options: { enabled: navigating },
        shortcut: 'peek',
      },
      {
        callback: () =>
          onToggleRows?.(
            cursor.selection().flatMap((row) => row[0]?.rowIndex ?? [])
          ),
        options: { enabled: navigating && !!onToggleRows },
        shortcut: 'selectRows',
      },
      {
        callback: () => {
          const cell = cursor.element()
          if (cell) {
            openContextMenuOn(cell)
          }
        },
        options: { enabled: navigating },
        shortcut: 'contextMenu',
      },
      {
        callback: () => {
          cursor.step(TO_EDGE, TO_EDGE)
          cursor.step(-TO_EDGE, -TO_EDGE, true)
        },
        options: { enabled: navigating },
        shortcut: 'selectAll',
      },
    ],
    { target: scrollRef }
  )
}

export const useGridPointer = (
  cursor: GridCursor,
  scrollRef: RefObject<HTMLDivElement | null>,
  barRef: RefObject<HTMLDivElement | null>
) => {
  const dragging = useRef(false)
  const releaseOnPressAway = useEffectEvent((event: globalThis.MouseEvent) => {
    const scroller = scrollRef.current
    const { target } = event
    if (
      event.button !== 0 ||
      !scroller ||
      !(target instanceof Element) ||
      scroller.contains(target.closest('[role=row]')) ||
      barRef.current?.contains(target) ||
      target.closest('[data-base-ui-portal]') ||
      // A scrollbar press lands on the scroller itself, outside its client box.
      (target === scroller &&
        (event.offsetX >= scroller.clientWidth ||
          event.offsetY >= scroller.clientHeight)) ||
      !cursor.commit()
    ) {
      return
    }
    cursor.store.set({ anchor: null, cursor: null, edit: null, peek: false })
    if (scroller.contains(target)) {
      // Focusing the scroller would place a fresh cursor on the first cell.
      event.preventDefault()
      scroller.blur()
    }
  })
  useEffect(() => {
    document.addEventListener('mousedown', releaseOnPressAway, true)
    return () =>
      document.removeEventListener('mousedown', releaseOnPressAway, true)
  }, [])
  return {
    onClick: (event: MouseEvent) => {
      if (getPosition(event) && isCheckbox(event)) {
        cursor.edit()
      }
    },
    onContextMenuCapture: (event: MouseEvent) => {
      const position = getPosition(event)
      if (position && !inRange(cursor.store.get(), position, cursor.getIndex)) {
        cursor.place(position)
      }
    },
    onDoubleClick: (event: MouseEvent) => {
      if (getPosition(event) && !isCheckbox(event)) {
        cursor.edit()
      }
    },
    onPointerDown: (event: PointerEvent) => {
      const position = getPosition(event)
      if (event.button !== 0 || !position) {
        return
      }
      dragging.current = true
      cursor.place(position, event.shiftKey)
    },
    onPointerOver: (event: PointerEvent) => {
      if (event.buttons !== 1) {
        dragging.current = false
        return
      }
      const position = getPosition(event)
      if (dragging.current && position) {
        cursor.place(position, true)
      }
    },
  }
}
