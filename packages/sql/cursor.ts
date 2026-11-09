import { identifierName, isKeyword, isPunctuation } from './tokenizer'
import type { Token } from './tokenizer'

export interface ColumnRef {
  qualifier: string | null
  name: string
}

const WORD_KINDS = new Set(['identifier', 'keyword', 'function', 'type'])

export const columnRefAt = (
  tokens: Token[],
  index: number
): ColumnRef | null => {
  const token = tokens[index]
  if (token?.kind !== 'identifier') {
    return null
  }
  const qualifier = tokens[index - 2]
  return {
    name: identifierName(token),
    qualifier:
      isPunctuation(tokens[index - 1], '.') && qualifier?.kind === 'identifier'
        ? identifierName(qualifier)
        : null,
  }
}

export const columnBeforeValue = (before: Token[], cursor: number) => {
  const previous = before[cursor]
  if (previous?.kind === 'operator') {
    return columnRefAt(before, cursor - 1)
  }
  if (isPunctuation(previous, '(') && isKeyword(before[cursor - 1], 'IN')) {
    return columnRefAt(
      before,
      isKeyword(before[cursor - 2], 'NOT') ? cursor - 3 : cursor - 2
    )
  }
  if (isKeyword(previous, 'BETWEEN', 'LIKE', 'ILIKE')) {
    return columnRefAt(before, cursor - 1)
  }
  return null
}

const topLevel = (tokens: Token[]) => {
  let depth = 0
  return tokens.map((token) => {
    if (isPunctuation(token, ')')) {
      depth -= 1
    }
    const level = depth
    if (isPunctuation(token, '(')) {
      depth += 1
    }
    return level === 0
  })
}

/** The items of the query's own select list, split at its top-level commas. */
export const selectList = (body: Token[]) => {
  const outside = topLevel(body)
  const select = body.findIndex(
    (token, index) => outside[index] && isKeyword(token, 'SELECT')
  )
  if (select === -1) {
    return { at: undefined, segments: [] }
  }
  const segments: Token[][] = [[]]
  let index = select + 1
  while (isKeyword(body[index], 'DISTINCT', 'ALL')) {
    index += 1
  }
  if (isKeyword(body[index], 'ON') && isPunctuation(body[index + 1], '(')) {
    index += 2
    while (body[index] && !outside[index]) {
      index += 1
    }
  }
  for (; body[index]; index += 1) {
    const token = body[index]
    if (outside[index] && isKeyword(token, 'FROM', 'UNION', 'INTO')) {
      break
    }
    if (outside[index] && isPunctuation(token, ',')) {
      segments.push([])
    } else if (token) {
      segments.at(-1)?.push(token)
    }
  }
  return { at: body[select], segments }
}

export const selectedColumns = (statementTokens: Token[]) =>
  selectList(statementTokens).segments.flatMap((segment) =>
    segment.length > 0 &&
    segment.every(
      (token) => token.kind === 'identifier' || isPunctuation(token, '.')
    )
      ? [segment.map((token) => token.text).join('')]
      : []
  )

export const wordAt = (tokens: Token[], offset: number) =>
  tokens.find(
    (token) =>
      WORD_KINDS.has(token.kind) && token.start < offset && offset <= token.end
  )

export const literalAt = (tokens: Token[], offset: number) =>
  tokens.find(
    (token) =>
      (token.kind === 'string' || token.kind === 'comment') &&
      token.start < offset &&
      offset <= token.end &&
      (offset < token.end ||
        token.unclosed === true ||
        (token.kind === 'comment' && !token.text.startsWith('/*')))
  )

export const qualifierBefore = (before: Token[]) => {
  const qualifier: string[] = []
  let cursor = before.length - 1
  for (
    let part = before[cursor - 1];
    isPunctuation(before[cursor], '.') && part?.kind === 'identifier';
    part = before[cursor - 1]
  ) {
    qualifier.unshift(identifierName(part))
    cursor -= 2
  }
  return { cursor, qualifier }
}

export const stringContentRange = (literal: Token | undefined) =>
  literal?.kind === 'string' && literal.text.startsWith("'")
    ? {
        end: literal.end - (literal.unclosed ? 0 : 1),
        start: literal.start + 1,
      }
    : undefined
