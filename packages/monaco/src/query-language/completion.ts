import { silently } from '@tamery/shared/utils'
import type { CompletionKind, DialectSpec } from '@tamery/sql'
import { completionContext, completionItems } from '@tamery/sql'
import type { IPosition } from 'monaco-editor'
import { editor, languages } from 'monaco-editor'

import type { TableRef } from './source'
import { boundSources, EMPTY_CATALOG, getRange } from './source'

const COMPLETION_KINDS: Record<CompletionKind, languages.CompletionItemKind> = {
  column: languages.CompletionItemKind.Field,
  enum: languages.CompletionItemKind.EnumMember,
  function: languages.CompletionItemKind.Function,
  keyword: languages.CompletionItemKind.Keyword,
  operator: languages.CompletionItemKind.Operator,
  schema: languages.CompletionItemKind.Module,
  table: languages.CompletionItemKind.Class,
  value: languages.CompletionItemKind.Value,
  view: languages.CompletionItemKind.Interface,
}

export const SQL_COMPLETION_OPTIONS = {
  inlineSuggest: {
    enabled: true,
    showToolbar: 'never',
  },
  // `other` defaults to 'offWhenInlineCompletions': the list would wait on the AI ghost-text request.
  quickSuggestions: { comments: 'off', other: 'on', strings: 'on' },
  quickSuggestionsDelay: 0,
  suggest: {
    preview: false,
    selectionMode: 'whenQuickSuggestion',
    showWords: false,
  },
} satisfies editor.IStandaloneEditorConstructionOptions

const ASK_GHOST_TEXT = {
  id: 'editor.action.inlineSuggest.trigger',
  title: 'Suggest',
}

export const resuggestOnceLoaded = async (
  loading: Promise<unknown>,
  model: editor.ITextModel,
  position: IPosition
) => {
  const version = model.getVersionId()
  try {
    await loading
  } catch {
    return
  }
  if (model.getVersionId() !== version) {
    return
  }
  editor
    .getEditors()
    .find(
      (codeEditor) =>
        codeEditor.getModel() === model &&
        codeEditor.hasTextFocus() &&
        codeEditor.getPosition()?.equals(position)
    )
    ?.trigger('sql-catalog', 'editor.action.triggerSuggest', { auto: true })
}

export const registerCompletion = (id: string, dialect: DialectSpec) =>
  languages.registerCompletionItemProvider(id, {
    provideCompletionItems: (model, position, trigger) => {
      const text = model.getValue()
      const offset = model.getOffsetAt(position)
      const context = completionContext(text, offset, dialect)
      const openedByGap =
        trigger.triggerCharacter === ' ' || trigger.triggerCharacter === '('
      if (
        (openedByGap && context.expects === 'any') ||
        (trigger.triggerCharacter === "'" && !context.inLiteral)
      ) {
        return { suggestions: [] }
      }
      const source = boundSources.get(model)
      let catalog = EMPTY_CATALOG
      let loading: Promise<unknown> | undefined
      if (source) {
        catalog = source.catalog()
        const [first, second] = context.qualifier
        const refs: TableRef[] = [...context.scope.tables]
        if (first !== undefined) {
          refs.push(
            second === undefined
              ? { name: first, schema: null }
              : { name: second, schema: first }
          )
        }
        loading = source.load(refs)
      }
      const items = completionItems(context, catalog, dialect)
      if (
        openedByGap &&
        context.expects === 'column' &&
        context.comparedColumn &&
        !items.some((item) => item.kind === 'enum' || item.kind === 'value')
      ) {
        void silently(() => loading)
        return { incomplete: loading !== undefined, suggestions: [] }
      }
      if (loading) {
        void resuggestOnceLoaded(loading, model, position)
      }
      const range = getRange(model, context.replaceStart, context.replaceEnd)
      return {
        incomplete: loading !== undefined,
        suggestions: items.map((item) => ({
          command: ASK_GHOST_TEXT,
          detail: item.detail,
          insertText: item.insertText,
          insertTextRules: item.snippet
            ? languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          kind: COMPLETION_KINDS[item.kind],
          label: item.label,
          range,
          sortText: item.sortText,
        })),
      }
    },
    triggerCharacters: ['.', ' ', '(', "'"],
  })
