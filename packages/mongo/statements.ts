import type { CodeChar } from './lexer'
import { codeChars } from './lexer'

export interface MongoStatement {
  text: string
  start: number
  end: number
  /** Past the `;` that ends the statement, or `end` when a line break does. */
  terminatorEnd: number
}

const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])
/** A line ending in one of these goes on below, as JavaScript reads it. */
const CONTINUES_LINE = new Set([
  '!',
  '&',
  '(',
  '*',
  '+',
  ',',
  '-',
  '.',
  ':',
  '=',
  '?',
  '[',
  '{',
  '|',
])

const isBlank = (char: string) => /\s/u.test(char)

const nextSignificant = (chars: CodeChar[], from: number) =>
  chars.slice(from).find(({ char }) => !isBlank(char))?.char

export const splitStatements = (text: string): MongoStatement[] => {
  const { chars } = codeChars(text)
  const statements: MongoStatement[] = []
  let depth = 0
  let start: number | null = null
  let end = 0
  let last = ''

  const close = (terminatorEnd: number) => {
    if (start !== null) {
      statements.push({
        end,
        start,
        terminatorEnd: Math.max(terminatorEnd, end),
        text: text.slice(start, end),
      })
    }
    start = null
    last = ''
  }

  for (const [position, { char, index }] of chars.entries()) {
    if (start === null && (isBlank(char) || char === ';')) {
      continue
    }
    start ??= index
    if (OPENERS.has(char)) {
      depth += 1
    } else if (CLOSERS.has(char)) {
      depth = Math.max(0, depth - 1)
    }
    if (depth === 0 && char === ';') {
      close(index + 1)
      continue
    }
    if (
      depth === 0 &&
      char === '\n' &&
      !CONTINUES_LINE.has(last) &&
      nextSignificant(chars, position + 1) !== '.'
    ) {
      close(end)
      continue
    }
    if (!isBlank(char)) {
      last = char
      end = index + 1
    }
  }
  close(end)
  return statements
}

export const statementAt = (
  statements: MongoStatement[],
  offset: number,
  text: string
) =>
  statements.findLast(
    ({ start, terminatorEnd }) =>
      offset >= start &&
      (offset <= terminatorEnd ||
        !text.slice(terminatorEnd, offset).includes('\n'))
  )
