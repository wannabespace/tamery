import type { DialectSpec, NameCase } from './dialect'
import { OPERATORS } from './vocabulary'

type TokenKind =
  | 'comment'
  | 'function'
  | 'identifier'
  | 'keyword'
  | 'number'
  | 'operator'
  | 'punctuation'
  | 'string'
  | 'type'
  | 'variable'

export interface Token {
  kind: TokenKind
  text: string
  start: number
  end: number
  unclosed?: true
  quoted?: true
  name?: string
}

interface OpenState {
  kind: 'comment' | 'string' | 'identifier'
  close: string
  backslash: boolean
  doubled: boolean
}

export type TokenizerState = OpenState | { kind: 'none' }

export const INITIAL_STATE: TokenizerState = { kind: 'none' }
const NO_ESCAPES = { backslash: false, doubled: false }

const WORD_START = /[\p{L}_]/u
const WORD = /[\p{L}\p{N}_$]/u
const DIGIT = /\d/u
const NON_ASCII = /[^\0-\u007F]/u
const DASH_COMMENT_GAP = /[\s\p{Cc}]/u
const DOLLAR_TAG = /\$(?<tag>[A-Za-z_]\w*)?\$/uy
const STRING_OPENER = /[BENXbenx]?'|"/uy
const ALTERNATIVE_QUOTE_OPENER = /[Nn]?[Qq]'\S/uy
const NUMBER =
  /(?:0x[\dA-Fa-f]+|\d+(?:\.\d*)?(?:[Ee][+-]?\d+)?|\.\d+(?:[Ee][+-]?\d+)?)/uy
const CALL_PAREN = /\s*\(/uy
const PUNCTUATION = new Set(['(', ')', ',', ';', '.', '[', ']', '{', '}', ':'])
const CLOSING_BRACKET: Record<string, string> = {
  '(': ')',
  '<': '>',
  '[': ']',
  '{': '}',
}

const stickyMatch = (regex: RegExp, text: string, at: number) => {
  regex.lastIndex = at
  return regex.exec(text)?.[0]
}

const nonAsciiName = (char: string, dialect: DialectSpec) =>
  dialect.nonAsciiNames && NON_ASCII.test(char)

const wordEnd = (text: string, from: number, dialect: DialectSpec) => {
  let end = from
  while (
    end < text.length &&
    (WORD.test(text[end] ?? '') || nonAsciiName(text[end] ?? '', dialect))
  ) {
    end += 1
  }
  return end
}

const scanUntil = (
  text: string,
  from: number,
  { backslash, close, doubled }: OpenState
): { end: number; unclosed: boolean } => {
  let index = from
  while (index < text.length) {
    if (backslash && text[index] === '\\') {
      index += 2
      continue
    }
    if (text.startsWith(close, index)) {
      if (doubled && text.startsWith(close, index + close.length)) {
        index += close.length * 2
        continue
      }
      return { end: index + close.length, unclosed: false }
    }
    index += 1
  }
  return { end: text.length, unclosed: true }
}

const openingAt = (
  text: string,
  index: number,
  dialect: DialectSpec
): { pending: OpenState; contentStart: number } | null => {
  const char = text[index] ?? ''
  if (text.startsWith('/*', index)) {
    return {
      contentStart: index + 2,
      pending: { ...NO_ESCAPES, close: '*/', kind: 'comment' },
    }
  }
  if (dialect.dollarQuotes && char === '$') {
    const tag = stickyMatch(DOLLAR_TAG, text, index)
    if (tag) {
      return {
        contentStart: index + tag.length,
        pending: { ...NO_ESCAPES, close: tag, kind: 'string' },
      }
    }
  }
  if (dialect.identifierQuotes.includes(char)) {
    return {
      contentStart: index + 1,
      pending: {
        ...NO_ESCAPES,
        close: CLOSING_BRACKET[char] ?? char,
        doubled: true,
        kind: 'identifier',
      },
    }
  }
  const alternativeOpener =
    dialect.alternativeQuotes &&
    stickyMatch(ALTERNATIVE_QUOTE_OPENER, text, index)
  if (alternativeOpener) {
    const delimiter = alternativeOpener.at(-1) ?? ''
    return {
      contentStart: index + alternativeOpener.length,
      pending: {
        ...NO_ESCAPES,
        close: `${CLOSING_BRACKET[delimiter] ?? delimiter}'`,
        kind: 'string',
      },
    }
  }
  const stringOpener = stickyMatch(STRING_OPENER, text, index)
  if (stringOpener) {
    return {
      contentStart: index + stringOpener.length,
      pending: {
        backslash: dialect.backslashEscapes || char.toUpperCase() === 'E',
        close: char === '"' ? '"' : "'",
        doubled: true,
        kind: 'string',
      },
    }
  }
  return null
}

const wordKind = (
  text: string,
  start: number,
  end: number,
  dialect: DialectSpec
): TokenKind => {
  const upper = text.slice(start, end).toUpperCase()
  if (dialect.keywords.has(upper)) {
    return 'keyword'
  }
  if (dialect.types.has(upper)) {
    return 'type'
  }
  if (dialect.functions.has(upper) && stickyMatch(CALL_PAREN, text, end)) {
    return 'function'
  }
  return 'identifier'
}

const startsLineComment = (text: string, index: number, dialect: DialectSpec) =>
  (text.startsWith('--', index) &&
    (!dialect.spacedDashComments ||
      DASH_COMMENT_GAP.test(text[index + 2] ?? ' '))) ||
  (dialect.hashComments && text[index] === '#' && text[index + 1] !== '>')

const tokenAt = (
  text: string,
  index: number,
  dialect: DialectSpec
): Pick<Token, 'kind' | 'end'> | null => {
  const char = text[index] ?? ''
  const next = text[index + 1] ?? ''

  if (startsLineComment(text, index, dialect)) {
    const newline = text.indexOf('\n', index)
    return { end: newline === -1 ? text.length : newline, kind: 'comment' }
  }
  if (
    (dialect.atVariables && char === '@' && WORD.test(next)) ||
    (char === '$' && DIGIT.test(next))
  ) {
    return { end: wordEnd(text, index + 1, dialect), kind: 'variable' }
  }
  if (DIGIT.test(char) || (char === '.' && DIGIT.test(next))) {
    const match = stickyMatch(NUMBER, text, index)
    if (match) {
      return { end: index + match.length, kind: 'number' }
    }
  }
  if (WORD_START.test(char) || nonAsciiName(char, dialect)) {
    const end = wordEnd(text, index + 1, dialect)
    return { end, kind: wordKind(text, index, end, dialect) }
  }
  const operator = OPERATORS.find((candidate) =>
    text.startsWith(candidate, index)
  )
  if (operator) {
    return { end: index + operator.length, kind: 'operator' }
  }
  if (PUNCTUATION.has(char)) {
    return { end: index + 1, kind: 'punctuation' }
  }
  return null
}

const foldName = (name: string, nameCase: NameCase) =>
  nameCase === 'upper' ? name.toUpperCase() : name.toLowerCase()

export const tokenize = (
  text: string,
  dialect: DialectSpec,
  initialState: TokenizerState = INITIAL_STATE
): { tokens: Token[]; state: TokenizerState } => {
  const tokens: Token[] = []
  let state = initialState
  let index = 0

  const push = (
    kind: TokenKind,
    start: number,
    end: number,
    extra?: Pick<Token, 'name' | 'quoted' | 'unclosed'>
  ) => {
    tokens.push({ end, kind, start, text: text.slice(start, end), ...extra })
    index = end
  }

  const pushEnclosed = (
    pending: OpenState,
    start: number,
    contentStart: number
  ) => {
    const { end, unclosed } = scanUntil(text, contentStart, pending)
    const { close } = pending
    push(pending.kind, start, end, {
      ...(pending.kind === 'identifier' && {
        name: text
          .slice(contentStart, unclosed ? end : end - close.length)
          .replaceAll(close + close, close),
        quoted: true,
      }),
      ...(unclosed && { unclosed }),
    })
    state = unclosed ? pending : INITIAL_STATE
  }

  while (index < text.length) {
    if (state.kind !== 'none') {
      pushEnclosed(state, index, index)
      continue
    }
    const char = text[index] ?? ''
    if (/\s/u.test(char) && !nonAsciiName(char, dialect)) {
      index += 1
      continue
    }
    const opening = openingAt(text, index, dialect)
    if (opening) {
      pushEnclosed(opening.pending, index, opening.contentStart)
      continue
    }
    const token = tokenAt(text, index, dialect)
    if (token) {
      push(
        token.kind,
        index,
        token.end,
        token.kind === 'identifier' && dialect.nameCase
          ? { name: foldName(text.slice(index, token.end), dialect.nameCase) }
          : undefined
      )
    } else {
      index += 1
    }
  }

  return { state, tokens }
}

export const identifierName = (token: Token) => token.name ?? token.text

export const isKeyword = (token: Token | undefined, ...words: string[]) =>
  token?.kind === 'keyword' && words.includes(token.text.toUpperCase())

export const isPunctuation = (token: Token | undefined, char: string) =>
  token?.kind === 'punctuation' && token.text === char
