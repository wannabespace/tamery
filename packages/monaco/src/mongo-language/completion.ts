import type {
  MongoCatalog,
  MongoCompletionKind,
} from '@tamery/mongo/completion'
import {
  mongoCompletionContext,
  mongoCompletionItems,
} from '@tamery/mongo/completion'
import { languages } from 'monaco-editor'

import { resuggestOnceLoaded } from '../query-language/completion'
import { boundSources, getRange } from '../query-language/source'
import type { QuerySource } from '../query-language/source'

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

const catalogOf = (source: QuerySource | undefined): MongoCatalog => {
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

const toSuggestion = (
  item: ReturnType<typeof mongoCompletionItems>[number],
  range: ReturnType<typeof getRange>
): languages.CompletionItem => ({
  detail: item.detail,
  insertText: item.insertText,
  insertTextRules: item.snippet
    ? languages.CompletionItemInsertTextRule.InsertAsSnippet
    : undefined,
  kind: COMPLETION_KINDS[item.kind],
  label: item.label,
  range,
  sortText: item.sortText,
})

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
        suggestions: mongoCompletionItems(context, catalog).map((item) =>
          toSuggestion(item, range)
        ),
      }
    },
    triggerCharacters: ['.', '$', '{', ',', ':', '('],
  })

/** The language for the Insert document editor: the collection cannot name an insert's keys, so a fixed wrapper just lets the shared parser reach the value position, where it offers the BSON constructors. */
export const MONGO_DOCUMENT_LANGUAGE = 'mongodb-document'

const DOCUMENT_WRAPPER = 'db.getCollection("_").insertOne('

const EMPTY_MONGO_CATALOG: MongoCatalog = {
  collections: [],
  fields: () => null,
}

export const registerMongoDocumentCompletion = (id: string) =>
  languages.registerCompletionItemProvider(id, {
    provideCompletionItems: (model, position) => {
      const context = mongoCompletionContext(
        DOCUMENT_WRAPPER + model.getValue(),
        DOCUMENT_WRAPPER.length + model.getOffsetAt(position)
      )
      const range = getRange(
        model,
        context.replaceStart - DOCUMENT_WRAPPER.length,
        context.replaceEnd - DOCUMENT_WRAPPER.length
      )
      return {
        suggestions: mongoCompletionItems(context, EMPTY_MONGO_CATALOG).map(
          (item) => toSuggestion(item, range)
        ),
      }
    },
    triggerCharacters: ['$', '(', ':'],
  })
