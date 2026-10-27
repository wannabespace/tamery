import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { noop, sleep } from '@tamery/shared/utils'
import { Result } from 'better-result'
import type { CancellationToken, editor, Position } from 'monaco-editor'
import { KeyCode, languages, Range } from 'monaco-editor'

import type { GhostTextLanguage } from './ghost-text-language'
import type { GhostTextOffer } from './ghost-text-offer'
import { typedAlong } from './ghost-text-offer'
import type { QuerySource } from './source'
import { boundSources, catalogSummaryFor } from './source'

const GHOST_TEXT_DELAY = 150

const ghostTextSuppressed = new WeakSet<editor.ITextModel>()

const askedWithList = new WeakMap<editor.ITextModel, number>()

const offeredGhostText = new WeakMap<
  editor.ITextModel,
  { text: string; versionId: number }
>()

const lastGhostText = new WeakMap<editor.ITextModel, GhostTextOffer>()

const requestCurrent = (
  model: editor.ITextModel,
  source: QuerySource,
  token: CancellationToken
) => !token.isCancellationRequested && boundSources.get(model) === source

/** Monaco's default range swallows the rest of the line, including auto-closed quotes and `;`. */
const ghostItem = (
  model: editor.ITextModel,
  position: Position,
  insertText: string
) => {
  const restOfLine = model
    .getLineContent(position.lineNumber)
    .slice(position.column - 1)
  const repeatsRest = restOfLine !== '' && insertText.endsWith(restOfLine)
  return {
    insertText: repeatsRest
      ? insertText.slice(0, insertText.length - restOfLine.length)
      : insertText,
    range: Range.fromPositions(position),
  }
}

const drawnDecorations = new WeakMap<editor.ITextModel, string[]>()

const drawnGhostText = {
  clear: (model: editor.ITextModel) => {
    const decorations = drawnDecorations.get(model)
    if (decorations) {
      model.deltaDecorations(decorations, [])
      drawnDecorations.delete(model)
    }
  },
  draw: (model: editor.ITextModel, position: Position, text: string) => {
    drawnDecorations.set(
      model,
      model.deltaDecorations(drawnDecorations.get(model) ?? [], [
        {
          options: {
            after: { content: text, inlineClassName: 'ghost-text-decoration' },
            showIfCollapsed: true,
          },
          range: Range.fromPositions(position),
        },
      ])
    )
  },
}

export const bindQueryModel = (
  model: editor.ITextModel,
  source: QuerySource
) => {
  drawnGhostText.clear(model)
  offeredGhostText.delete(model)
  lastGhostText.delete(model)
  askedWithList.delete(model)
  ghostTextSuppressed.delete(model)
  boundSources.set(model, source)
}

const offer = (
  model: editor.ITextModel,
  position: Position,
  text: string,
  listOpen: boolean
) => {
  const item = ghostItem(
    model,
    position,
    listOpen ? (text.split('\n')[0] ?? '') : text
  )
  if (!item.insertText) {
    return { items: [] }
  }
  offeredGhostText.set(model, {
    text: item.insertText,
    versionId: model.getVersionId(),
  })
  if (!listOpen) {
    return { items: [item] }
  }
  drawnGhostText.draw(model, position, item.insertText)
  return { items: [] }
}

const cachedOffer = (
  model: editor.ITextModel,
  position: Position,
  listOpen: boolean
) => {
  const last = lastGhostText.get(model)
  const remembered =
    last && typedAlong(last, model.getValue(), model.getOffsetAt(position))
  if (remembered) {
    return offer(model, position, remembered, listOpen)
  }
  if (!listOpen) {
    return
  }
  // Monaco asks again on every list-row move without changing the text.
  const versionId = model.getVersionId()
  if (askedWithList.get(model) === versionId) {
    return { items: [] }
  }
  askedWithList.set(model, versionId)
}

const GHOST_TEXT_SELECTOR =
  '.ghost-text-decoration, .ghost-text-decoration-preview, .ghost-text'

export const drawnGhostTextElement = (
  codeEditor: editor.IStandaloneCodeEditor
) =>
  [...(codeEditor.getDomNode()?.querySelectorAll(GHOST_TEXT_SELECTOR) ?? [])]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0)
    .toSorted(
      (a, b) => a.rect.bottom - b.rect.bottom || a.rect.right - b.rect.right
    )
    .at(-1)?.element ?? null

const ghostTextLive = (
  codeEditor: editor.IStandaloneCodeEditor,
  model: editor.ITextModel
) =>
  offeredGhostText.get(model)?.versionId === model.getVersionId() &&
  Boolean(codeEditor.getDomNode()?.querySelector(GHOST_TEXT_SELECTOR))

export const acceptGhostText = (codeEditor: editor.IStandaloneCodeEditor) => {
  const model = codeEditor.getModel()
  const position = codeEditor.getPosition()
  const offered = model && offeredGhostText.get(model)
  if (!model || !position || offered?.versionId !== model.getVersionId()) {
    return false
  }
  codeEditor.trigger('runner', 'hideSuggestWidget', null)
  const item = ghostItem(model, position, offered.text)
  codeEditor.executeEdits('ai-ghost-text', [
    { forceMoveMarkers: true, range: item.range, text: item.insertText },
  ])
  codeEditor.pushUndoStop()
  return true
}

export const dismissGhostText = (codeEditor: editor.IStandaloneCodeEditor) => {
  const model = codeEditor.getModel()
  if (model) {
    ghostTextSuppressed.add(model)
    drawnGhostText.clear(model)
  }
  codeEditor.trigger('runner', 'editor.action.inlineSuggest.hide', null)
}

export const attachGhostTextEscape = (
  codeEditor: editor.IStandaloneCodeEditor
) => {
  const keyListener = codeEditor.onKeyDown((event) => {
    const model = codeEditor.getModel()
    if (
      event.keyCode === KeyCode.Escape &&
      model &&
      ghostTextLive(codeEditor, model)
    ) {
      ghostTextSuppressed.add(model)
    }
    if (
      event.keyCode === KeyCode.Tab &&
      model &&
      codeEditor.getDomNode()?.querySelector('.suggest-widget.visible') &&
      ghostTextLive(codeEditor, model) &&
      acceptGhostText(codeEditor)
    ) {
      event.preventDefault()
      event.stopPropagation()
    }
  })
  const cursorListener = codeEditor.onDidChangeCursorPosition(() => {
    const model = codeEditor.getModel()
    if (model) {
      drawnGhostText.clear(model)
    }
  })
  const contentListener = codeEditor.onDidChangeModelContent(() => {
    const model = codeEditor.getModel()
    if (model) {
      ghostTextSuppressed.delete(model)
    }
  })
  return () => {
    keyListener.dispose()
    cursorListener.dispose()
    contentListener.dispose()
  }
}

const LEADING_BLANK_LINES = /^\s*\n/u

export const registerGhostText = (id: string, lang: GhostTextLanguage) =>
  languages.registerInlineCompletionsProvider(id, {
    disposeInlineCompletions: noop,
    provideInlineCompletions: async (model, position, context, token) => {
      const source = boundSources.get(model)
      offeredGhostText.delete(model)
      drawnGhostText.clear(model)
      if (
        !source ||
        ghostTextSuppressed.has(model) ||
        !source.ghostTextEnabled()
      ) {
        return { items: [] }
      }
      const listOpen = context.selectedSuggestionInfo !== undefined
      const cached = cachedOffer(model, position, listOpen)
      if (cached) {
        return cached
      }
      const text = model.getValue()
      const versionId = model.getVersionId()
      const offset = model.getOffsetAt(position)
      const window = lang.window(text, offset)
      if (lang.inString(text.slice(0, offset))) {
        return { items: [] }
      }
      if (!text.slice(window.start, window.end).trim()) {
        return { items: [] }
      }
      await sleep(GHOST_TEXT_DELAY)
      if (!requestCurrent(model, source, token)) {
        return { items: [] }
      }
      const explicit =
        context.triggerKind === languages.InlineCompletionTriggerKind.Explicit
      const before = text.slice(window.start, offset)
      // Sync with `needsLeadingSpace`'s explicit branch, which expects this space.
      const prefix = (
        explicit && /\w$/u.test(before) ? `${before} ` : before
      ).slice(-AI_QUERY_LIMITS.query)
      const suffix = text.slice(
        offset,
        Math.min(window.end, offset + AI_QUERY_LIMITS.query)
      )
      const schema = await catalogSummaryFor(model, prefix + suffix)
      if (!requestCurrent(model, source, token)) {
        return { items: [] }
      }
      const controller = new AbortController()
      const cancellation = token.onCancellationRequested(() =>
        controller.abort()
      )
      const completion = await Result.tryPromise(() =>
        source.complete({ context: schema, prefix, suffix }, controller.signal)
      )
      const reply = completion.unwrapOr(null)
      cancellation.dispose()
      if (
        !reply ||
        !requestCurrent(model, source, token) ||
        model.getVersionId() !== versionId
      ) {
        return { items: [] }
      }
      const blankLine = !model
        .getLineContent(position.lineNumber)
        .slice(0, position.column - 1)
        .trim()
      // Judged after the cut: what follows the statement (echoed schema comments) is never shown.
      const suggestion = lang.trimToStatement(
        text.slice(0, offset),
        blankLine ? reply.replace(LEADING_BLANK_LINES, '') : reply
      )
      if (!suggestion.trim() || lang.looksInvalid(suggestion.trim())) {
        return { items: [] }
      }
      const insertText = lang.needsLeadingSpace(
        text.slice(0, offset),
        suggestion,
        explicit
      )
        ? ` ${suggestion}`
        : suggestion
      lastGhostText.set(model, {
        after: text.slice(offset),
        before: text.slice(0, offset),
        text: insertText,
      })
      return offer(model, position, insertText, listOpen)
    },
  })
