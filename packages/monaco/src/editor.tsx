import './worker'
import { noop } from '@tamery/shared/utils'
import { formatXml } from '@tamery/shared/xml'
import { ResizablePin } from '@tamery/ui/components/custom/resizable'
import { useMountedEffect } from '@tamery/ui/hookas/use-mounted-effect'
import { resolvedTheme } from '@tamery/ui/theme-store'
import { Result } from 'better-result'
import * as monaco from 'monaco-editor'
import type { RefObject } from 'react'
import { useEffect, useEffectEvent, useRef } from 'react'

const githubTheme = (
  base: 'vs' | 'vs-dark',
  c: {
    background: string
    comment: string
    foreground: string
    function: string
    keyword: string
    number: string
    string: string
  }
): monaco.editor.IStandaloneThemeData => ({
  base,
  colors: {
    'editor.background': c.background,
    'editor.foreground': c.foreground,
    'editor.lineHighlightBackground': base === 'vs' ? '#00000005' : '#ffffff06',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#5081f150',
    'editorGutter.background': c.background,
    // Monaco outlines any focused button, input or textarea inside the editor, over Tailwind's `outline-none`.
    focusBorder: '#00000000',
  },
  inherit: false,
  rules: [
    { foreground: c.foreground, token: '' },
    { foreground: c.keyword, token: 'keyword' },
    { foreground: c.keyword, token: 'operator.keyword' },
    { foreground: c.string, token: 'string' },
    { foreground: c.string, token: 'identifier.quote' },
    { foreground: c.number, token: 'number' },
    { foreground: c.number, token: 'variable' },
    { foreground: c.number, token: 'string.key.json' },
    { foreground: c.string, token: 'string.value.json' },
    { foreground: c.function, token: 'predefined' },
    { foreground: c.function, token: 'type' },
    { foreground: c.comment, token: 'comment' },
    { foreground: c.foreground, token: 'operator' },
    { foreground: c.foreground, token: 'delimiter' },
    { foreground: c.foreground, token: 'identifier' },
  ],
})

monaco.editor.defineTheme(
  'github-light',
  githubTheme('vs', {
    background: '#ffffff',
    comment: '#6a737d',
    foreground: '#24292e',
    function: '#6f42c1',
    keyword: '#d73a49',
    number: '#005cc5',
    string: '#032f62',
  })
)
monaco.editor.defineTheme(
  'github-dark',
  githubTheme('vs-dark', {
    background: '#222528',
    comment: '#6a737d',
    foreground: '#e1e4e8',
    function: '#b392f0',
    keyword: '#f97583',
    number: '#79b8ff',
    string: '#9ecbff',
  })
)

resolvedTheme.subscribe(
  (theme) => {
    monaco.editor.setTheme(theme === 'dark' ? 'github-dark' : 'github-light')
  },
  { immediate: true }
)

export const FIELD_EDITOR_OPTIONS = {
  fontSize: 12,
  lineNumbersMinChars: 3,
  padding: { top: 8 },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
} satisfies monaco.editor.IStandaloneEditorConstructionOptions

// Every editor state Monaco's own Escape bindings undo; the leave action must not shadow any of them. Monaco also dispatches keys from its focused frame, so without `editorTextFocus` the action would swallow every later Escape.
const ESCAPE_UNUSED =
  'editorTextFocus && !suggestWidgetVisible && !inlineSuggestionVisible && !parameterHintsVisible && !findWidgetVisible && !editorHasSelection && !editorHasMultipleSelections'

export const Monaco = ({
  ref,
  value,
  language,
  options,
  onChange = noop,
  onSubmit,
  leaveOnEscape = false,
  ...props
}: {
  ref?: RefObject<monaco.editor.IStandaloneCodeEditor | null>
  className?: string
  style?: React.CSSProperties
  value: string
  language?: string
  onChange?: (value: string) => void
  onSubmit?: () => void
  /** Escape the editor has no use for moves focus from the text to the editor's frame instead of reaching the page, so a dialog around it stays open until the next Escape. */
  leaveOnEscape?: boolean
  options?: monaco.editor.IStandaloneEditorConstructionOptions
}) => {
  const elementRef = useRef<HTMLDivElement>(null)
  const monacoInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null
  )
  const preventTriggerChangeEventRef = useRef(false)
  const pendingEchoesRef = useRef<string[]>([])

  const onChangeEvent = useEffectEvent(onChange)
  const onSubmitEvent = useEffectEvent(() => onSubmit?.())
  const submitEnabled = Boolean(onSubmit)
  const getOptionsEvent = useEffectEvent((editorLanguage?: string) => {
    let initialValue = value
    if (editorLanguage?.includes('json')) {
      initialValue = Result.try(() =>
        JSON.stringify(JSON.parse(value), null, 2)
      ).unwrapOr(value)
    } else if (editorLanguage?.includes('xml')) {
      initialValue = Result.try(() => formatXml(value)).unwrapOr(value)
    }
    return {
      automaticLayout: true,
      fontFamily: '"Geist Mono Variable", monospace',
      language: editorLanguage,
      minimap: { enabled: false },
      tabSize: 2,
      value: initialValue,
      ...options,
    } satisfies monaco.editor.IStandaloneEditorConstructionOptions
  })

  useEffect(() => {
    if (!elementRef.current) {
      return
    }

    monacoInstanceRef.current = monaco.editor.create(
      elementRef.current,
      getOptionsEvent(language)
    )

    if (ref) {
      ref.current = monacoInstanceRef.current
    }

    monacoInstanceRef.current?.getAction('editor.action.formatDocument')?.run()

    const subscription = monacoInstanceRef.current.onDidChangeModelContent(
      () => {
        if (!preventTriggerChangeEventRef.current) {
          const val = monacoInstanceRef.current?.getValue() ?? ''
          pendingEchoesRef.current.push(val)
          onChangeEvent(val)
        }
      }
    )

    const submitAction = submitEnabled
      ? monacoInstanceRef.current.addAction({
          id: 'tamery.monaco-submit',
          // oxlint-disable-next-line no-bitwise -- monaco keybindings are bit flags
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
          label: 'Submit',
          run: () => onSubmitEvent(),
        })
      : undefined

    const leaveAction = leaveOnEscape
      ? monacoInstanceRef.current.addAction({
          id: 'tamery.monaco-leave',
          keybindings: [monaco.KeyCode.Escape],
          label: 'Leave editor',
          precondition: ESCAPE_UNUSED,
          run: (editor) => editor.getContainerDomNode().focus(),
        })
      : undefined

    return () => {
      subscription.dispose()
      submitAction?.dispose()
      leaveAction?.dispose()
      monacoInstanceRef.current?.dispose()
      monacoInstanceRef.current = null
      if (ref) {
        ref.current = null
      }
    }
  }, [language, leaveOnEscape, ref, submitEnabled])

  useMountedEffect(() => {
    if (!monacoInstanceRef.current || !options) {
      return
    }

    monacoInstanceRef.current.updateOptions(options)
  }, [options])

  useMountedEffect(() => {
    if (!monacoInstanceRef.current) {
      return
    }

    const editor = monacoInstanceRef.current
    const model = editor.getModel()

    if (!model) {
      return
    }

    // A parent can render a value this editor emitted after the user typed past it; writing that echo back drops the newer keystrokes.
    const echo = pendingEchoesRef.current.indexOf(value)
    if (echo !== -1) {
      pendingEchoesRef.current.splice(0, echo + 1)
      return
    }
    pendingEchoesRef.current = []

    if (editor.getValue() === value) {
      return
    }

    if (options?.readOnly) {
      editor.setValue(value)
    } else {
      preventTriggerChangeEventRef.current = true
      editor.executeEdits('', [
        {
          forceMoveMarkers: true,
          range: model.getFullModelRange(),
          text: value,
        },
      ])
      editor.pushUndoStop()
      preventTriggerChangeEventRef.current = false
    }
  }, [value, options?.readOnly, language])

  return (
    <div {...props}>
      <ResizablePin className="size-full">
        <div
          ref={elementRef}
          tabIndex={leaveOnEscape ? -1 : undefined}
          className="size-full"
        />
      </ResizablePin>
    </div>
  )
}
