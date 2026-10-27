import { drawnGhostTextElement } from '@tamery/monaco/query-language'
import { statementAt } from '@tamery/sql'
import { editor } from 'monaco-editor'
import type { RefObject } from 'react'
import { useEffect, useEffectEvent } from 'react'

import { useTabContext } from '~/core/connection/route'

import { runnerStatements, useRunnerTab } from './store'
import { runnerTransaction } from './transaction'

const RUN_SLOT = '\u00A0'.repeat(8)
export const RUN_SLOT_GAP = 12
// Sync with the kit button's `icon-2xs` height.
const RUN_BUTTON_HEIGHT = 20
const RUN_SLOT_CLASS = 'sql-run-slot'

export interface RunAnchor {
  top: number
  left: number
  start: number
  source: string
  suggestion: { left: number; top: number } | null
}

export const sameSpot = (
  a: { left: number; top: number } | null | undefined,
  b: { left: number; top: number } | null | undefined
) => a?.left === b?.left && a?.top === b?.top

export const useStatementBand = (
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>,
  onMove: (anchor: RunAnchor | null) => void
) => {
  const move = useEffectEvent(onMove)
  const { dialect } = useTabContext()
  const tab = useRunnerTab()
  const statements = runnerStatements({ ...tab, dialect })

  useEffect(() => {
    const codeEditor = editorRef.current
    if (!codeEditor) {
      return
    }
    const band = codeEditor.createDecorationsCollection()
    let frame = 0
    let active = { source: '', start: 0 }

    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const suggestion = drawnGhostTextElement(codeEditor)
        const slot = codeEditor
          .getDomNode()
          ?.querySelector(`.${RUN_SLOT_CLASS}`)
        const root = codeEditor.getDomNode()?.getBoundingClientRect()
        if (!root) {
          return
        }
        const spot = (rect: DOMRect, left: number) => ({
          left: left - root.left,
          top: rect.top + (rect.height - RUN_BUTTON_HEIGHT) / 2 - root.top,
        })
        const suggestionRect = suggestion?.getBoundingClientRect()
        const suggestionSpot = suggestionRect
          ? spot(suggestionRect, suggestionRect.right)
          : null
        const slotRect = slot?.getBoundingClientRect()
        const statementSpot = slotRect
          ? spot(slotRect, slotRect.left)
          : suggestionSpot
        move(
          statementSpot
            ? { ...active, ...statementSpot, suggestion: suggestionSpot }
            : null
        )
      })
    }

    const paint = () => {
      const model = codeEditor.getModel()
      const position = codeEditor.getPosition()
      if (!model || !position) {
        return
      }
      const statement = statementAt(
        statements.get(),
        model.getOffsetAt(position),
        model.getValue()
      )
      if (!statement || !codeEditor.getSelection()?.isEmpty()) {
        cancelAnimationFrame(frame)
        move(null)
        band.clear()
        return
      }
      const turn = runnerTransaction.step({
        dialect,
        statement,
        tab,
        text: model.getValue(),
      })
      active = { source: turn.text, start: turn.start }
      const lines = (item: typeof statement) => ({
        options: { className: 'sql-active-band', isWholeLine: true },
        range: {
          endColumn: 1,
          endLineNumber: model.getPositionAt(item.terminatorEnd).lineNumber,
          startColumn: 1,
          startLineNumber: model.getPositionAt(item.start).lineNumber,
        },
      })
      const endLine = model.getPositionAt(turn.terminatorEnd).lineNumber
      const endColumn = model.getLineMaxColumn(endLine)
      const ghost = drawnGhostTextElement(codeEditor)
      band.set([
        lines(statement),
        ...(turn === statement ? [] : [lines(turn)]),
        ...(ghost &&
        position.lineNumber === endLine &&
        position.column === endColumn
          ? []
          : [
              {
                options: {
                  after: {
                    content: RUN_SLOT,
                    // The caret never lands past the slot, so a click beyond the button still types before it.
                    cursorStops: editor.InjectedTextCursorStops.Left,
                    inlineClassName: RUN_SLOT_CLASS,
                  },
                  showIfCollapsed: true,
                },
                range: {
                  endColumn,
                  endLineNumber: endLine,
                  startColumn: endColumn,
                  startLineNumber: endLine,
                },
              },
            ]),
      ])
      measure()
    }

    paint()
    const unsubscribe = statements.subscribe(paint)
    const unsubscribeTransaction = runnerTransaction.state(tab).subscribe(paint)
    const cursorListener = codeEditor.onDidChangeCursorSelection(paint)
    const scrollListener = codeEditor.onDidScrollChange(paint)
    const layoutListener = codeEditor.onDidLayoutChange(paint)
    // View zones (the AI card) shift lines without a cursor, scroll or layout event.
    const sizeListener = codeEditor.onDidContentSizeChange(paint)
    let hadGhost = false
    const ghostObserver = new MutationObserver(() => {
      const hasGhost = drawnGhostTextElement(codeEditor) !== null
      if (hasGhost !== hadGhost) {
        hadGhost = hasGhost
        paint()
      } else if (hasGhost) {
        measure()
      }
    })
    const root = codeEditor.getDomNode()
    if (root) {
      // No `attributes`: the caret blink rewrites a style attribute twice a second.
      ghostObserver.observe(root, {
        characterData: true,
        childList: true,
        subtree: true,
      })
    }

    return () => {
      unsubscribe()
      unsubscribeTransaction()
      cursorListener.dispose()
      scrollListener.dispose()
      layoutListener.dispose()
      sizeListener.dispose()
      ghostObserver.disconnect()
      cancelAnimationFrame(frame)
      band.clear()
    }
  }, [dialect, editorRef, statements, tab])
}
