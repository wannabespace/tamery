import type { MongoCompletionContext, Target } from './context'
import type { MongoMethod } from './methods'
import { COLLECTION_METHODS, CURSOR_METHODS, DATABASE_METHODS } from './methods'
import { BSON_CONSTRUCTORS } from './operators'

export { mongoCompletionContext } from './context'
export type { MongoCompletionContext } from './context'

export type MongoCompletionKind =
  | 'collection'
  | 'constructor'
  | 'field'
  | 'keyword'
  | 'method'
  | 'operator'
  | 'view'

export interface MongoCompletionItem {
  detail?: string
  insertText: string
  kind: MongoCompletionKind
  label: string
  snippet?: true
  sortText: string
}

export interface MongoCatalog {
  collections: { name: string; view: boolean }[]
  /** `null` while the collection's fields are still loading. */
  fields: (collection: string) => { name: string; type: string }[] | null
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u

const methodItems = (methods: Record<string, MongoMethod>, sortText: string) =>
  Object.entries(methods).map(
    ([name, { signature, snippet }]): MongoCompletionItem => ({
      detail: signature,
      insertText: snippet,
      kind: 'method',
      label: name,
      snippet: true,
      sortText: `${sortText}${name}`,
    })
  )

const operatorItems = (operators: readonly string[]): MongoCompletionItem[] =>
  operators.map((operator) => ({
    insertText: `\\${operator}: `,
    kind: 'operator',
    label: operator,
    snippet: true,
    sortText: `2${operator}`,
  }))

const NAVIGATION: Record<string, MongoMethod> = {
  getCollection: {
    effect: 'read',
    signature: 'getCollection(name)',
    snippet: "getCollection('$0')",
  },
  getSiblingDB: {
    effect: 'read',
    signature: 'getSiblingDB(name)',
    snippet: "getSiblingDB('$0')",
  },
}

const ITEMS: Record<
  Exclude<Target['kind'], 'key'>,
  (catalog: MongoCatalog) => MongoCompletionItem[]
> = {
  collection: () => methodItems(COLLECTION_METHODS, '1'),
  cursor: () => methodItems(CURSOR_METHODS, '1'),
  database: ({ collections }) => [
    ...collections.map(({ name, view }): MongoCompletionItem => ({
      insertText: IDENTIFIER.test(name)
        ? name
        : `getCollection(${JSON.stringify(name)})`,
      kind: view ? 'view' : 'collection',
      label: name,
      sortText: `1${name}`,
    })),
    ...methodItems({ ...NAVIGATION, ...DATABASE_METHODS }, '2'),
  ],
  root: () => [
    { insertText: 'db', kind: 'keyword', label: 'db', sortText: '1db' },
  ],
  value: () =>
    Object.entries(BSON_CONSTRUCTORS).map(([name, snippet]) => ({
      insertText: snippet,
      kind: 'constructor',
      label: name,
      snippet: true,
      sortText: `3${name}`,
    })),
}

export const mongoCompletionItems = (
  { collection, target }: MongoCompletionContext,
  catalog: MongoCatalog
): MongoCompletionItem[] => {
  if (target?.kind !== 'key') {
    return target ? ITEMS[target.kind](catalog) : []
  }
  const fields =
    target.fields && collection ? (catalog.fields(collection) ?? []) : []
  return [
    ...fields.map(({ name, type }): MongoCompletionItem => ({
      detail: type,
      insertText: `${IDENTIFIER.test(name) ? name : JSON.stringify(name)}: `,
      kind: 'field',
      label: name,
      sortText: `1${name}`,
    })),
    ...operatorItems(target.operators),
  ]
}
