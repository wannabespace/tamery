import type {
  MongoCatalog,
  MongoCompletionKind,
} from '@tamery/mongo/completion'
import {
  mongoCompletionContext,
  mongoCompletionItems,
} from '@tamery/mongo/completion'
import { languages } from 'monaco-editor'

import { resuggestOnceLoaded } from '../sql-language/completion'
import { boundSources, getRange } from '../sql-language/source'
import type { SqlSource } from '../sql-language/source'

const COMPLETION_KINDS: Record<
  MongoCompletionKind,
  languages.CompletionItemKind
> = {
  collection: languages.CompletionItemKind.Class,
  constructor: languages.CompletionItemKind.Constructor,
  field: languages.CompletionItemKind.Field,
  keyword: languages.CompletionItemKind.Keyword,
  method: languages.CompletionItemKind.Method,
  operator: languages.CompletionItemKind.Operator,
  view: languages.CompletionItemKind.Interface,
}

const catalogOf = (source: SqlSource | undefined): MongoCatalog => {
  const catalog = source?.catalog()
  const tables = catalog?.schemas.flatMap(({ tables: list }) => list) ?? []
  return {
    collections: tables.map(({ kind, name }) => ({
      name,
      view: kind === 'view',
    })),
    fields: (collection) =>
      tables
        .find(({ name }) => name === collection)
        ?.columns?.map(({ name, type }) => ({ name, type })) ?? null,
  }
}

export const registerMongoCompletion = (id: string) =>
  languages.registerCompletionItemProvider(id, {
    provideCompletionItems: (model, position) => {
      const context = mongoCompletionContext(
        model.getValue(),
        model.getOffsetAt(position)
      )
      const source = boundSources.get(model)
      const catalog = catalogOf(source)
      const loading =
        context.target?.kind === 'key' &&
        context.collection &&
        catalog.fields(context.collection) === null
          ? source?.load([{ name: context.collection, schema: null }])
          : undefined
      if (loading) {
        void resuggestOnceLoaded(loading, model, position)
      }
      const range = getRange(model, context.replaceStart, context.replaceEnd)
      return {
        incomplete: loading !== undefined,
        suggestions: mongoCompletionItems(context, catalog).map((item) => ({
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
    triggerCharacters: ['.', '$', '{', ',', ':', '('],
  })
