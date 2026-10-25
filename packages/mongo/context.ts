import type { CodeChar } from './lexer'
import { codeChars } from './lexer'
import {
  EXPRESSION_OPERATORS,
  PIPELINE_STAGES,
  QUERY_OPERATORS,
  UPDATE_OPERATORS,
} from './operators'

export type Target =
  | { kind: 'collection' }
  | { kind: 'cursor' }
  | { kind: 'database' }
  | { fields: boolean; kind: 'key'; operators: readonly string[] }
  | { kind: 'root' }
  | { kind: 'value' }

export interface MongoCompletionContext {
  /** The collection whose fields the items name, so the editor can load them first. */
  collection: string | null
  replaceEnd: number
  replaceStart: number
  target: Target | null
}

interface Segment {
  args: string | null
  name: string
}

interface Open {
  char: string
  commas: number
  index: number
}

const NAME_BEFORE = /[\w$]+$/u
const NAME_AFTER = /^[\w$]*/u
const QUOTED = /^\s*(?<quote>['"`])(?<name>.*)\k<quote>\s*$/su

const CURSOR_SOURCES = new Set(['aggregate', 'find'])
const UPDATE_METHODS = new Set(['findOneAndUpdate', 'updateMany', 'updateOne'])
const FILTER_METHODS = new Set([
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  ...UPDATE_METHODS,
])

const skipBlank = (text: string, at: number) => {
  let index = at
  while (index > 0 && /\s/u.test(text[index - 1] ?? '')) {
    index -= 1
  }
  return index
}

const segmentsBefore = (
  text: string,
  end: number,
  openOf: Map<number, number>
) => {
  const segments: Segment[] = []
  let at = skipBlank(text, end)
  for (;;) {
    let args: string | null = null
    if (text[at - 1] === ')') {
      const open = openOf.get(at - 1)
      if (open === undefined) {
        return segments
      }
      args = text.slice(open + 1, at - 1)
      at = open
    }
    const name = NAME_BEFORE.exec(text.slice(0, at))?.[0]
    if (!name) {
      return segments
    }
    at -= name.length
    segments.unshift({ args, name })
    at = skipBlank(text, at)
    if (text[at - 1] !== '.') {
      return segments
    }
    at = skipBlank(text, at - 1)
  }
}

const unquote = (args: string) => QUOTED.exec(args)?.groups?.name ?? null

const classify = (segments: Segment[]) => {
  const [root, ...links] = segments
  if (root?.name !== 'db' || root.args !== null) {
    return null
  }
  let rest = links
  if (rest[0]?.name === 'getSiblingDB' && rest[0].args !== null) {
    rest = rest.slice(1)
  }
  if (rest.length === 0) {
    return { collection: null, kind: 'database' as const }
  }
  let collection: string | null
  if (rest[0]?.name === 'getCollection' && rest[0].args !== null) {
    collection = unquote(rest[0].args)
    rest = rest.slice(1)
  } else {
    const called = rest.findIndex(({ args }) => args !== null)
    const names = called === -1 ? rest : rest.slice(0, called)
    collection = names.map(({ name }) => name).join('.') || null
    rest = called === -1 ? [] : rest.slice(called)
  }
  if (rest.length === 0) {
    return { collection, kind: 'collection' as const }
  }
  return CURSOR_SOURCES.has(rest[0]?.name ?? '')
    ? { collection, kind: 'cursor' as const }
    : null
}

const keyTarget = (method: string, argument: number, path: string): Target => {
  if (method === 'aggregate') {
    return path === '[{'
      ? { fields: false, kind: 'key', operators: PIPELINE_STAGES }
      : {
          fields: true,
          kind: 'key',
          operators: [...QUERY_OPERATORS, ...EXPRESSION_OPERATORS],
        }
  }
  if (UPDATE_METHODS.has(method) && argument === 1) {
    return path === '{'
      ? { fields: false, kind: 'key', operators: UPDATE_OPERATORS }
      : { fields: true, kind: 'key', operators: [] }
  }
  const filterArgument = method === 'distinct' ? 1 : 0
  return FILTER_METHODS.has(method) && argument === filterArgument
    ? { fields: true, kind: 'key', operators: QUERY_OPERATORS }
    : { fields: true, kind: 'key', operators: [] }
}

const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])
const VALUE_STARTS = new Set(['(', ',', ':', '['])

const brackets = (chars: CodeChar[]) => {
  const stack: Open[] = []
  const openOf = new Map<number, number>()
  for (const { char, index } of chars) {
    if (OPENERS.has(char)) {
      stack.push({ char, commas: 0, index })
    } else if (CLOSERS.has(char)) {
      const open = stack.pop()
      if (open) {
        openOf.set(index, open.index)
      }
    } else if (char === ',') {
      const top = stack.at(-1)
      if (top) {
        top.commas += 1
      }
    }
  }
  return { openOf, stack }
}

const argumentTarget = (
  text: string,
  {
    openOf,
    previous,
    stack,
  }: { openOf: Map<number, number>; previous: string; stack: Open[] }
): Pick<MongoCompletionContext, 'collection' | 'target'> | null => {
  const paren = stack.findLastIndex(({ char }) => char === '(')
  const call = stack[paren]
  if (!call) {
    return null
  }
  const callee = segmentsBefore(text, call.index, openOf)
  const chain = classify(callee.slice(0, -1))
  const collection =
    chain?.kind === 'database' ? null : (chain?.collection ?? null)
  if (stack.at(-1)?.char === '{' && (previous === '{' || previous === ',')) {
    const path = stack
      .slice(paren + 1)
      .map(({ char }) => char)
      .join('')
    return {
      collection,
      target: keyTarget(callee.at(-1)?.name ?? '', call.commas, path),
    }
  }
  return VALUE_STARTS.has(previous)
    ? { collection, target: { kind: 'value' } }
    : null
}

export const mongoCompletionContext = (
  text: string,
  offset: number
): MongoCompletionContext => {
  const prefix = NAME_BEFORE.exec(text.slice(0, offset))?.[0] ?? ''
  const replaceStart = offset - prefix.length
  const replaceEnd =
    offset + (NAME_AFTER.exec(text.slice(offset))?.[0].length ?? 0)
  const none = { collection: null, replaceEnd, replaceStart, target: null }

  const { chars, state } = codeChars(text, replaceStart)
  if (state.open) {
    return none
  }
  const { openOf, stack } = brackets(chars)

  const before = skipBlank(text, replaceStart)
  const previous = text[before - 1] ?? ''
  if (previous === '.') {
    const chain = classify(segmentsBefore(text, before - 1, openOf))
    return chain
      ? {
          collection: chain.collection,
          replaceEnd,
          replaceStart,
          target: { kind: chain.kind },
        }
      : none
  }

  if (stack.length === 0) {
    return { ...none, target: { kind: 'root' } }
  }
  return { ...none, ...argumentTarget(text, { openOf, previous, stack }) }
}
