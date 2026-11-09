import type { Token } from './tokenizer'
import { identifierName, isKeyword, isPunctuation } from './tokenizer'

/** A CTE or a derived table: its columns come from `body`, the query inside its parentheses. */
export interface Relation {
  name: string
  body: Token[]
  columnNames: string[]
}

export const derivedAlias = (tokens: Token[], index: number) => {
  const alias = isKeyword(tokens[index + 1], 'AS')
    ? tokens[index + 2]
    : tokens[index + 1]
  return alias?.kind === 'identifier' ? identifierName(alias) : null
}

export const cteAt = (tokens: Token[], index: number) => {
  if (
    tokens[index]?.kind !== 'identifier' ||
    !['WITH', 'RECURSIVE', ','].includes(
      tokens[index - 1]?.text.toUpperCase() ?? ''
    )
  ) {
    return null
  }
  const columnNames: string[] = []
  let cursor = index + 1
  if (isPunctuation(tokens[cursor], '(')) {
    for (
      let part = tokens[cursor];
      part && !isPunctuation(part, ')');
      part = tokens[cursor]
    ) {
      if (part.kind === 'identifier') {
        columnNames.push(identifierName(part))
      }
      cursor += 1
    }
    cursor += 1
  }
  if (!isKeyword(tokens[cursor], 'AS')) {
    return null
  }
  cursor += 1
  while (isKeyword(tokens[cursor], 'NOT', 'MATERIALIZED')) {
    cursor += 1
  }
  return isPunctuation(tokens[cursor], '(')
    ? { columnNames, open: cursor }
    : null
}

export const closingParen = (tokens: Token[], open: number) => {
  let depth = 0
  for (let index = open; index < tokens.length; index += 1) {
    if (isPunctuation(tokens[index], '(')) {
      depth += 1
    } else if (isPunctuation(tokens[index], ')')) {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }
  return tokens.length
}
