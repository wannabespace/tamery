import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { catalogSummaryFor } from '@tamery/monaco/query-language'
import type { ConnectionType } from '@tamery/shared/enums/connection-type'
import { renderWithRoot } from '@tamery/ui/lib/render'
import { editor as monacoEditor, Range } from 'monaco-editor'
import type { RefObject } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { toast } from 'sonner'

import { schemaNotes } from '~/core/schema-notes/notes'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { AiEditZone } from './runner-ai-edit-zone'
import type { Phase } from './runner-ai-edit-zone'

const CARD_HEIGHT = 32
const SHADOW_ROOM = 12
export const useAiEdit = ({
  connectionResourceId,
  connectionType,
  editorRef,
}: {
  connectionResourceId: string
  connectionType: ConnectionType
  editorRef: RefObject<monacoEditor.IStandaloneCodeEditor | null>
}) => {
  const [phase, setPhase] = useState<Phase | null>(null)
  const zoneRef = useRef<{
    id: string
    root: ReturnType<typeof renderWithRoot>['root']
    widget: monacoEditor.IOverlayWidget
    zone: monacoEditor.IViewZone
  } | null>(null)
  const targetRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(
    null
  )
  const requestRef = useRef<AbortController | null>(null)

  const target = () => targetRef.current?.getRange(0) ?? null

  const track = (range: Range, reviewing: boolean) => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    if (!targetRef.current) {
      targetRef.current = editor.createDecorationsCollection()
    }
    targetRef.current.set([
      {
        options: {
          className: reviewing ? 'ai-edit-band' : undefined,
          isWholeLine: true,
          stickiness:
            monacoEditor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
        range,
      },
    ])
  }

  const close = () => {
    requestRef.current?.abort()
    requestRef.current = null
    const editor = editorRef.current
    const zone = zoneRef.current
    if (editor && zone) {
      editor.changeViewZones((accessor) => accessor.removeZone(zone.id))
      editor.removeOverlayWidget(zone.widget)
      queueMicrotask(() => zone.root.unmount())
    }
    zoneRef.current = null
    targetRef.current?.clear()
    setPhase(null)
  }

  const closeAndFocus = () => {
    close()
    editorRef.current?.focus()
  }

  const revert = () => {
    const editor = editorRef.current
    const range = target()
    if (editor && range && phase?.kind === 'review') {
      if (editor.getModel()?.getValueInRange(range) === phase.applied) {
        editor.executeEdits('ai-reject', [{ range, text: phase.original }])
      } else {
        toast.info('Kept your edits to the rewrite')
      }
    }
  }

  const reject = () => {
    posthog.capture('ai_query_edit_rejected')
    revert()
    closeAndFocus()
  }

  const review = (original: string, text: string, fix: boolean) => {
    const editor = editorRef.current
    const model = editor?.getModel()
    const range = target()
    if (!editor || !model || !range) {
      return
    }
    if (model.getValueInRange(range) !== original) {
      toast.info('The statement changed while the AI was working')
      closeAndFocus()
      return
    }
    if (text.trim() === original.trim()) {
      toast.info(fix ? 'The AI found nothing to fix' : 'Nothing to change')
      closeAndFocus()
      return
    }
    editor.executeEdits('ai-edit', [{ range, text }])
    editor.pushUndoStop()
    const startOffset = model.getOffsetAt(range.getStartPosition())
    const rewritten = Range.fromPositions(
      model.getPositionAt(startOffset),
      model.getPositionAt(startOffset + text.length)
    )
    track(rewritten, true)
    editor.revealRangeInCenterIfOutsideViewport(rewritten)
    setPhase({ applied: text, fix, kind: 'review', original })
    // The prompt input unmounts on review; without focus back in the editor ⌘↩ and Esc reach nothing.
    editor.focus()
  }

  const request = async (
    range: Range,
    pending: Phase,
    call: (
      input: {
        context: string
        editor: string
        query: string
        type: ConnectionType
      },
      signal: AbortSignal
    ) => Promise<string>
  ) => {
    const model = editorRef.current?.getModel()
    if (!model) {
      return
    }
    const original = model.getValueInRange(range)
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    track(range, false)
    setPhase(pending)
    try {
      const context = schemaNotes
        .inContext(
          await catalogSummaryFor(model, original),
          connectionResourceId
        )
        .slice(0, AI_QUERY_LIMITS.context)
      const text = await call(
        {
          context,
          editor: model.getValue().slice(0, AI_QUERY_LIMITS.query),
          query: original,
          type: connectionType,
        },
        controller.signal
      )
      if (requestRef.current === controller) {
        review(original, text, pending.kind === 'fixing')
      }
    } catch (error) {
      if (requestRef.current === controller) {
        toast.error(error instanceof Error ? error.message : String(error))
        closeAndFocus()
      }
    }
  }

  const open = (range: Range) => {
    close()
    track(range, false)
    setPhase({ busy: false, kind: 'prompt' })
  }

  const fix = (range: Range, error: string) => {
    posthog.capture('ai_query_fix_requested')
    close()
    // Fixing has no input to hold focus, so Esc reaches the editor's reject binding instead.
    editorRef.current?.focus()
    return request(range, { error, kind: 'fixing' }, (input, signal) =>
      orpc.ai.fixQuery.call({ ...input, error }, { signal })
    )
  }

  const accept = () => {
    posthog.capture('ai_query_edit_accepted')
    if (phase?.kind === 'review') {
      closeAndFocus()
    }
  }

  const submit = (prompt: string, images: File[]) => {
    posthog.capture('ai_query_edit_requested', { images: images.length })
    const range = target()
    if (range) {
      request(range, { busy: true, kind: 'prompt' }, (input, signal) =>
        orpc.ai.updateQuery.call({ ...input, images, prompt }, { signal })
      )
    }
  }

  const resizeZone = (cardHeight: number) => {
    const editor = editorRef.current
    const { current } = zoneRef
    if (!editor || !current) {
      return
    }
    current.zone.heightInPx = cardHeight + SHADOW_ROOM
    editor.changeViewZones((accessor) => accessor.layoutZone(current.id))
  }

  useEffect(() => {
    const editor = editorRef.current
    const range = target()
    if (!editor || !phase || !range) {
      return
    }
    const element = (
      <AiEditZone
        phase={phase}
        onAccept={accept}
        onClose={reject}
        onResize={resizeZone}
        onSubmit={submit}
      />
    )
    if (zoneRef.current) {
      zoneRef.current.root.render(element)
      return
    }
    const { domNode, root } = renderWithRoot(element)
    domNode.style.zIndex = '10'
    // The card lives in an overlay widget, the zone only makes room: Monaco marks every view zone aria-hidden.
    const widget = {
      getDomNode: () => domNode,
      getId: () => 'tamery.ai-edit',
      getPosition: () => null,
    }
    editor.addOverlayWidget(widget)
    const zone = {
      afterLineNumber: range.startLineNumber - 1,
      domNode: document.createElement('div'),
      heightInPx: CARD_HEIGHT + SHADOW_ROOM,
      onDomNodeTop: (top: number) => {
        const { contentLeft, contentWidth } = editor.getLayoutInfo()
        domNode.style.top = `${top}px`
        domNode.style.left = `${contentLeft}px`
        domNode.style.width = `${contentWidth}px`
      },
    }
    editor.changeViewZones((accessor) => {
      zoneRef.current = { id: accessor.addZone(zone), root, widget, zone }
    })
  })

  const closeIfDeleted = useEffectEvent(() => {
    const range = target()
    if (
      range &&
      !editorRef.current?.getModel()?.getValueInRange(range).trim()
    ) {
      close()
    }
  })

  const active = phase !== null

  useEffect(() => {
    if (!active) {
      return
    }
    const listener = editorRef.current?.onDidChangeModelContent(() =>
      queueMicrotask(closeIfDeleted)
    )
    return () => listener?.dispose()
  }, [active, editorRef])

  const discardOnUnmount = useEffectEvent(() => {
    revert()
    close()
  })

  useEffect(() => () => discardOnUnmount(), [])

  return {
    accept,
    editing: phase !== null,
    fix,
    open,
    reject,
    reviewing: phase?.kind === 'review' || phase?.kind === 'fixing',
  }
}
