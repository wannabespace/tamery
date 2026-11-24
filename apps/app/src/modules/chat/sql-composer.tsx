import { ESCAPE_UNUSED, Monaco } from '@tamery/monaco/editor'
import {
  QUERY_COMPLETION_OPTIONS,
  languageIds,
} from '@tamery/monaco/query-language'
import { KeyCode, KeyMod } from 'monaco-editor'
import type { editor } from 'monaco-editor'
import type { CSSProperties, RefObject } from 'react'
import { useEffect, useEffectEvent, useState } from 'react'

import { useTabContext } from '~/core/connection/route'
import { attachQuerySource } from '~/core/query-editor/query-source'

// The composer textarea's two lines and its `max-h-64`.
const MIN_HEIGHT = 56
const MAX_HEIGHT = 256

const OPTIONS = {
  ...QUERY_COMPLETION_OPTIONS,
  ariaLabel: 'SQL to run',
  contextmenu: false,
  fixedOverflowWidgets: true,
  folding: false,
  fontSize: 13,
  glyphMargin: false,
  lineDecorationsWidth: 12,
  lineHeight: 20,
  lineNumbers: 'off',
  overviewRulerLanes: 0,
  padding: { bottom: 8, top: 10 },
  placeholder: 'SQL to run, ⌫ to go back to chat',
  renderLineHighlight: 'none',
  scrollBeyondLastLine: false,
  scrollbar: {
    alwaysConsumeMouseWheel: false,
    horizontal: 'hidden',
    verticalScrollbarSize: 5,
  },
  wordWrap: 'on',
} satisfies editor.IStandaloneEditorConstructionOptions

/** The composer's SQL mode: the Query tab's editor, with its schema completion and AI ghost text, keyed like the message box. Enter runs, ⌘↩ runs now, Escape or Backspace at the start goes back to a message. */
export const SqlComposer = ({
  editorRef,
  value,
  onChange,
  onLeave,
  onSubmit,
}: {
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>
  value: string
  onChange: (value: string) => void
  onLeave: () => void
  onSubmit: (now: boolean) => void
}) => {
  const { connection, connectionResource, dialect } = useTabContext()
  const [height, setHeight] = useState(MIN_HEIGHT)
  const leave = useEffectEvent(onLeave)
  const submit = useEffectEvent(onSubmit)

  useEffect(() => {
    const codeEditor = editorRef.current
    if (!codeEditor) {
      return
    }
    const detachSource = attachQuerySource(
      codeEditor,
      connectionResource,
      connection.type,
      dialect
    )
    const disposables = [
      codeEditor.addAction({
        id: 'tamery.chat-sql-run',
        keybindings: [KeyCode.Enter],
        label: 'Run SQL',
        precondition: 'editorTextFocus && !suggestWidgetVisible',
        run: () => submit(false),
      }),
      codeEditor.addAction({
        id: 'tamery.chat-sql-run-now',
        // oxlint-disable-next-line no-bitwise -- monaco keybindings are bit flags
        keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
        label: 'Run SQL now',
        precondition: 'editorTextFocus',
        run: () => submit(true),
      }),
      codeEditor.addAction({
        id: 'tamery.chat-sql-leave',
        keybindings: [KeyCode.Escape],
        label: 'Back to message',
        precondition: ESCAPE_UNUSED,
        run: () => leave(),
      }),
      codeEditor.onKeyDown((event) => {
        const selection = codeEditor.getSelection()
        if (
          event.keyCode === KeyCode.Backspace &&
          selection?.isEmpty() &&
          selection.startLineNumber === 1 &&
          selection.startColumn === 1
        ) {
          event.preventDefault()
          leave()
        }
      }),
      codeEditor.onDidContentSizeChange(({ contentHeight }) =>
        setHeight(Math.min(Math.max(contentHeight, MIN_HEIGHT), MAX_HEIGHT))
      ),
    ]
    return () => {
      detachSource()
      for (const disposable of disposables) {
        disposable.dispose()
      }
    }
  }, [editorRef, connectionResource, connection.type, dialect])

  return (
    <Monaco
      data-mask
      ref={editorRef}
      // Monaco injects its theme after the app's styles; a descendant selector outranks it, so the editor takes the composer's fill.
      className="h-(--sql-height) w-full [&_.monaco-editor]:[--vscode-editor-background:transparent] [&_.monaco-editor]:[--vscode-editorGutter-background:transparent]"
      style={{ '--sql-height': `${height}px` } as CSSProperties}
      language={languageIds[dialect]}
      value={value}
      onChange={onChange}
      options={OPTIONS}
    />
  )
}
