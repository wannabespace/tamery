import type { Token } from './tokenizer'
import { identifierName, isKeyword, isPunctuation } from './tokenizer'

/** A CTE or a derived table: its columns come from `body`, the query inside its parentheses. */
export interface Relation {
  name: string
  body: Token[]
  columnNames: string[]
}

/** The names in a `(a, b)` column list at `from`, and the index right after it; none when `from` opens no list. */
const columnList = (tokens: Token[], from: number) => {
  const names: string[] = []
  if (!isPunctuation(tokens[from], '(')) {
    return { names, next: from }
  }
  let cursor = from
  for (
    let part = tokens[cursor];
    part && !isPunctuation(part, ')');
    part = tokens[cursor]
  ) {
    if (part.kind === 'identifier') {
      names.push(identifierName(part))
    }
    cursor += 1
  }
  return { names, next: cursor + 1 }
}

/** The alias after a parenthesized group closing at `index`: `) AS name (a, b)`. */
export const derivedAlias = (tokens: Token[], index: number) => {
  const at = isKeyword(tokens[index + 1], 'AS') ? index + 2 : index + 1
  const alias = tokens[at]
  if (alias?.kind !== 'identifier') {
    return null
  }
  const { names, next } = columnList(tokens, at + 1)
  return { columnNames: names, name: identifierName(alias), next }
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
  const { names: columnNames, next } = columnList(tokens, index + 1)
  let cursor = next
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
