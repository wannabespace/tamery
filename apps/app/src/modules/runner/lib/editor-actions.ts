import type { HotkeyChord } from '@tanstack/react-hotkeys'
import { LETTER_KEYS, parseHotkey } from '@tanstack/react-hotkeys'
import type { editor } from 'monaco-editor'
import { KeyCode, KeyMod } from 'monaco-editor'
import type { RefObject } from 'react'
import { useEffect, useEffectEvent } from 'react'

import { SHORTCUTS } from '~/core/keyboard/shortcuts'

const AI_REVIEW_CONTEXT_KEY = 'tameryAiReview'
const FAILED_CONTEXT_KEY = 'tameryFailedStatement'

const EDITOR_ACTIONS = [
  {
    name: 'runCurrent',
    precondition: `!${AI_REVIEW_CONTEXT_KEY}`,
    shortcut: 'runStatement',
  },
  {
    label: 'Accept AI edit',
    name: 'acceptAi',
    precondition: AI_REVIEW_CONTEXT_KEY,
    shortcut: 'runStatement',
  },
  { name: 'runAll', shortcut: 'runAll' },
  { name: 'saveCurrent', shortcut: 'saveStatement' },
  { name: 'saveAll', shortcut: 'saveTab' },
  { name: 'askAi', shortcut: 'editWithAi' },
  {
    name: 'fixAi',
    precondition: FAILED_CONTEXT_KEY,
    shortcut: 'fixWithAi',
  },
  {
    label: 'Statement actions',
    name: 'openStatementMenu',
    shortcut: 'contextMenu',
  },
  {
    label: 'Reject AI edit',
    name: 'rejectAi',
    precondition: `${AI_REVIEW_CONTEXT_KEY} && !suggestWidgetVisible && !findWidgetVisible && !inlineSuggestionVisible && !parameterHintsVisible`,
    shortcut: 'stepBack',
  },
] as const

type EditorActionName = (typeof EDITOR_ACTIONS)[number]['name']

const MONACO_KEYS: Record<string, KeyCode> = {
  ...Object.fromEntries(
    [...LETTER_KEYS].map((letter) => [letter, KeyCode[`Key${letter}`]])
  ),
  '.': KeyCode.Period,
  Enter: KeyCode.Enter,
  Escape: KeyCode.Escape,
}

// Monaco keybindings are bit flags; bitwise OR is required by the API.
/* oxlint-disable no-bitwise */
const monacoKeybinding = (hotkey: HotkeyChord) => {
  // Parsed as macOS so Mod lands on meta, which is what Monaco's CtrlCmd means on every platform.
  const { alt, code, ctrl, key, meta, shift } = parseHotkey(hotkey, 'mac')
  const keyCode = MONACO_KEYS[key ?? code]
  if (ctrl || keyCode === undefined) {
    throw new Error(`Monaco cannot bind ${hotkey}: extend MONACO_KEYS`)
  }
  return (
    (meta ? KeyMod.CtrlCmd : 0) |
    (shift ? KeyMod.Shift : 0) |
    (alt ? KeyMod.Alt : 0) |
    keyCode
  )
}
/* oxlint-enable no-bitwise */

export const useEditorActions = (
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>,
  handlers: Record<EditorActionName, () => void>,
  { failing, reviewing }: { failing: boolean; reviewing: boolean }
) => {
  const invoke = useEffectEvent((name: EditorActionName) => handlers[name]())

  useEffect(() => {
    const codeEditor = editorRef.current
    if (!codeEditor) {
      return
    }
    const disposables = [
      // Monaco claims ⌘L (expand line selection) and ⌘E (find with selection) and stops them bubbling, so the app's shortcuts are re-dispatched.
      ...(['aiChat', 'newQuery'] as const)
        .flatMap((shortcut) =>
          SHORTCUTS[shortcut].hotkeys.map((hotkey) => ({ hotkey, shortcut }))
        )
        .map(({ hotkey, shortcut }) =>
          codeEditor.addAction({
            id: `tamery.app-${hotkey}`,
            keybindings: [monacoKeybinding(hotkey)],
            label: SHORTCUTS[shortcut].title,
            run: () => {
              const { alt, ctrl, key, meta, shift } = parseHotkey(hotkey)
              document.dispatchEvent(
                new KeyboardEvent('keydown', {
                  altKey: alt,
                  bubbles: true,
                  ctrlKey: ctrl,
                  key,
                  metaKey: meta,
                  shiftKey: shift,
                })
              )
            },
          })
        ),
      ...EDITOR_ACTIONS.map(({ name, shortcut, ...action }) =>
        codeEditor.addAction({
          label: SHORTCUTS[shortcut].title,
          ...action,
          id: `tamery.${name}`,
          keybindings: SHORTCUTS[shortcut].hotkeys.map(monacoKeybinding),
          run: () => invoke(name),
        })
      ),
    ]
    return () => {
      for (const disposable of disposables) {
        disposable.dispose()
      }
    }
  }, [editorRef])

  useEffect(() => {
    const codeEditor = editorRef.current
    codeEditor?.createContextKey(AI_REVIEW_CONTEXT_KEY, reviewing)
    codeEditor?.createContextKey(FAILED_CONTEXT_KEY, failing)
    codeEditor?.updateOptions({ inlineSuggest: { enabled: !reviewing } })
  }, [editorRef, failing, reviewing])
}
