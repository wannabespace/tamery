import type { Relation } from './relation'
import { closingParen, cteAt, derivedAlias } from './relation'
import type { Token } from './tokenizer'
import { identifierName, isKeyword, isPunctuation } from './tokenizer'

export interface TableRef {
  schema: string | null
  name: string
  alias: string | null
  token: Token
}

export interface StatementScope {
  tables: TableRef[]
  ctes: string[]
  derived: string[]
  hasUnknownColumns: boolean
  relations: Relation[]
  /** The tables a name at the scope's offset can see: enclosing queries' first, its own query's last, so `at(-1)` is the latest join. */
  visible: TableRef[]
  /** The part of `visible` that belongs to the enclosing queries. */
  enclosing: TableRef[]
  /** The table an `INSERT INTO` or `UPDATE` at the top level writes. */
  target: TableRef | null
}

interface QueryBlock {
  parent: QueryBlock | null
  refs: TableRef[]
  started: boolean
}

export const TABLE_INTRODUCERS = ['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE']
const TABLE_MODIFIERS = ['ONLY', 'LATERAL', 'IGNORE', 'IF', 'NOT', 'EXISTS']

const readQualifiedName = (tokens: Token[], from: number) => {
  const parts: Token[] = []
  let index = from
  for (
    let token = tokens[index];
    token?.kind === 'identifier';
    token = tokens[index]
  ) {
    parts.push(token)
    if (!isPunctuation(tokens[index + 1], '.')) {
      break
    }
    index += 2
  }
  return { next: from + parts.length * 2 - 1, parts }
}

const tableRefAt = (
  tokens: Token[],
  from: number,
  parenIsCall: boolean
): { ref: TableRef; next: number } | null => {
  const { next, parts } = readQualifiedName(tokens, from)
  const nameToken = parts.at(-1)
  if (!nameToken || (parenIsCall && isPunctuation(tokens[next], '('))) {
    return null
  }
  const schemaToken = parts.at(-2)
  let after = next
  let alias: string | null = null
  if (isKeyword(tokens[after], 'AS')) {
    after += 1
  }
  const aliasToken = tokens[after]
  if (aliasToken?.kind === 'identifier') {
    alias = identifierName(aliasToken)
    after += 1
  }
  return {
    next: after,
    ref: {
      alias,
      name: identifierName(nameToken),
      schema: schemaToken ? identifierName(schemaToken) : null,
      token: nameToken,
    },
  }
}

const introducesTable = (tokens: Token[], index: number) => {
  const previous = tokens[index - 1]?.text.toUpperCase() ?? ''
  if (isKeyword(tokens[index], 'TABLE')) {
    return !['CREATE', 'TEMP', 'TEMPORARY', 'UNLOGGED'].includes(previous)
  }
  if (isKeyword(tokens[index], 'UPDATE')) {
    return previous !== 'FOR' && previous !== 'KEY'
  }
  return isKeyword(tokens[index], ...TABLE_INTRODUCERS)
}

const sourcesAfter = (tokens: Token[], index: number) => {
  const introducer = tokens[index]
  const listed = isKeyword(introducer, 'FROM') || isPunctuation(introducer, ',')
  const clause = listed || isKeyword(introducer, 'JOIN')
  const refs: TableRef[] = []
  let cursor = index + 1
  while (isKeyword(tokens[cursor], ...TABLE_MODIFIERS)) {
    cursor += 1
  }
  for (;;) {
    const found = tableRefAt(tokens, cursor, clause)
    if (!found) {
      const hasUnknownColumns =
        clause &&
        (isPunctuation(tokens[cursor], '(') ||
          isPunctuation(tokens[cursor + 1], '('))
      return { hasUnknownColumns, refs }
    }
    refs.push(found.ref)
    if (!(listed && isPunctuation(tokens[found.next], ','))) {
      return { hasUnknownColumns: false, refs }
    }
    cursor = found.next + 1
  }
}

const visibleFrom = (block: QueryBlock | null) => {
  const refs: TableRef[] = []
  for (let level: QueryBlock | null = block; level; level = level.parent) {
    refs.unshift(...level.refs)
  }
  return refs
}

const openFrame = (tokens: Token[], index: number, block: QueryBlock) => {
  const call = ['function', 'identifier', 'type'].includes(
    tokens[index - 1]?.kind ?? ''
  )
  return {
    block: call ? block : { parent: block, refs: [], started: false },
    call,
    open: index,
  }
}

/** A derived table is named only outside its parentheses, so a caret inside them never sees it. */
const derivedTable = (
  tokens: Token[],
  open: number,
  close: number,
  offset: number
) => {
  const alias = derivedAlias(tokens, close)
  const body = tokens.slice(open + 1, close)
  const [first] = body
  const closer = tokens[close]
  if (!alias || !closer || !first || !isKeyword(first, 'SELECT', 'WITH')) {
    return null
  }
  const { columnNames, name, next } = alias
  const ref: TableRef = { alias: null, name, schema: null, token: closer }
  const holdsOffset = first.start <= offset && offset <= closer.start
  const introducer = isKeyword(tokens[open - 1], 'LATERAL')
    ? tokens[open - 2]
    : tokens[open - 1]
  return {
    listContinuesAt:
      isKeyword(introducer, 'FROM', 'JOIN') && isPunctuation(tokens[next], ',')
        ? next
        : null,
    ref: holdsOffset ? null : ref,
    relation: { body, columnNames, name },
  }
}

/** `offset` picks which query's tables `visible` holds: a subquery sees its own and its enclosing queries', never a sibling's or a nested one's. */
export const statementScope = (
  tokens: Token[],
  offset = Number.POSITIVE_INFINITY
): StatementScope => {
  const tables: TableRef[] = []
  const ctes: string[] = []
  const derived: string[] = []
  const relations: Relation[] = []
  let hasUnknownColumns = false
  let target: TableRef | null = null
  const rootBlock: QueryBlock = { parent: null, refs: [], started: false }
  const root = { block: rootBlock, call: false, open: -1 }
  const frames = [root]
  let cursorBlock: QueryBlock | null = null

  const readSources = (index: number, block: QueryBlock) => {
    const sources = sourcesAfter(tokens, index)
    tables.push(...sources.refs)
    block.refs.push(...sources.refs)
    block.started = true
    hasUnknownColumns ||= sources.hasUnknownColumns
    if (frames.length === 1 && isKeyword(tokens[index], 'INTO', 'UPDATE')) {
      target ??= sources.refs[0] ?? null
    }
  }

  const closeFrame = (index: number) => {
    const frame = frames.at(-1) ?? root
    frames.length = Math.max(frames.length - 1, 1)
    const alias = derivedAlias(tokens, index)
    if (alias) {
      derived.push(alias.name)
    }
    const table = derivedTable(tokens, frame.open, index, offset)
    const outer = frames.at(-1) ?? root
    if (table) {
      relations.push(table.relation)
    }
    if (table?.ref) {
      outer.block.refs.push(table.ref)
    }
    if (table && table.listContinuesAt !== null) {
      readSources(table.listContinuesAt, outer.block)
    }
  }

  for (const [index, token] of tokens.entries()) {
    const frame = frames.at(-1) ?? root
    const cte = cteAt(tokens, index)
    if (token.start >= offset) {
      cursorBlock ??= frame.block
    }
    if (isPunctuation(token, '(')) {
      frames.push(openFrame(tokens, index, frame.block))
    } else if (isPunctuation(token, ')')) {
      closeFrame(index)
    } else if (isKeyword(token, 'SELECT')) {
      if (frame.block.started) {
        frame.block = { parent: frame.block.parent, refs: [], started: false }
      }
      frame.block.started = true
    } else if (cte) {
      ctes.push(identifierName(token))
      relations.push({
        body: tokens.slice(cte.open + 1, closingParen(tokens, cte.open)),
        columnNames: cte.columnNames,
        name: identifierName(token),
      })
    } else if (introducesTable(tokens, index) && !frame.call) {
      readSources(index, frame.block)
    }
  }

  const block = cursorBlock ?? (frames.at(-1) ?? root).block
  return {
    ctes,
    derived,
    enclosing: visibleFrom(block.parent),
    hasUnknownColumns,
    relations,
    tables,
    target,
    visible: visibleFrom(block),
  }
}
