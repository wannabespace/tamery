import {
  CONDITION_CLAUSES,
  completesCondition,
  isTerm,
  nextClauses,
} from './clauses'
import type { ColumnRef } from './cursor'
import {
  literalAt,
  stringContentRange,
  qualifierBefore,
  selectedColumns,
  columnRefAt,
  columnBeforeValue,
  wordAt,
} from './cursor'
import type { DialectSpec } from './dialect'
import type { StatementScope } from './scope'
import { statementScope, TABLE_INTRODUCERS } from './scope'
import { statementsFromTokens, statementAt } from './statements'
import type { Token } from './tokenizer'
import { isKeyword, isPunctuation, tokenize } from './tokenizer'

export interface CompletionContext {
  prefix: string
  replaceStart: number
  replaceEnd: number
  qualifier: string[]
  expects:
    | 'statement'
    | 'table'
    | 'column'
    | 'clause'
    | 'operator'
    | 'number'
    | 'target-column'
    | 'any'
  clauses: string[]
  template: 'select' | 'group-by' | 'join-on' | 'into' | null
  comparedColumn: ColumnRef | null
  selectedColumns: string[]
  keywordCase: 'upper' | 'lower'
  inLiteral: boolean
  scope: StatementScope
}

const COLUMN_INTRODUCERS = [
  'SELECT',
  'WHERE',
  'ON',
  'AND',
  'OR',
  'BY',
  'SET',
  'HAVING',
  'WHEN',
  'THEN',
  'ELSE',
  'DISTINCT',
  'RETURNING',
]

const VERBS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const OPERAND_KEYWORDS = [
  'AS',
  'BETWEEN',
  'EXISTS',
  'FALSE',
  'ILIKE',
  'IN',
  'IS',
  'LIKE',
  'NOT',
  'NULL',
  'TRUE',
]

const outsideClosedGroups = (tokens: Token[]) => {
  const flat: Token[] = []
  const opens: number[] = []
  for (const token of tokens) {
    const open = opens.at(-1)
    if (isPunctuation(token, ')') && open !== undefined) {
      opens.pop()
      flat.length = open + 1
    } else if (isPunctuation(token, '(')) {
      opens.push(flat.length)
    }
    flat.push(token)
  }
  return { flat, opens }
}

/** The clause the caret writes in, read at its own nesting level: a closed subquery before it does not count. */
const readClause = (statementTokens: Token[]) => {
  const { flat, opens } = outsideClosedGroups(statementTokens)
  const clauseAt = flat.findLastIndex(
    (token) =>
      token.kind === 'keyword' && !isKeyword(token, ...OPERAND_KEYWORDS)
  )
  const lastKeyword = flat[clauseAt]
  const clause = isKeyword(lastKeyword, 'BY')
    ? `${flat[clauseAt - 1]?.text.toUpperCase()} BY`
    : (lastKeyword?.text.toUpperCase() ?? '')
  const verb =
    flat.findLast((token) => isKeyword(token, ...VERBS))?.text.toUpperCase() ??
    ''
  const nested = (opens.at(-1) ?? -1) > clauseAt
  return { clause, clauseAt, flat, lastKeyword, nested, opens, verb }
}

const awaitsOperator = (flat: Token[], clause: string) =>
  CONDITION_CLAUSES.has(clause) &&
  (flat.at(-1)?.kind === 'identifier' || isPunctuation(flat.at(-1), ')')) &&
  !completesCondition(flat)

/** The caret names a column of the written table: `INSERT INTO t (…)`, `ON CONFLICT (…)` or an `UPDATE … SET` list. */
const namesTargetColumn = (
  flat: Token[],
  opens: number[],
  clauseAt: number
) => {
  const previous = flat.at(-1)
  const open = opens.at(-1) ?? -1
  const clause = flat[clauseAt]
  if (isPunctuation(previous, '(') || isPunctuation(previous, ',')) {
    const owner = flat[open - 1]
    if (
      open > clauseAt &&
      (isKeyword(owner, 'CONFLICT') ||
        (isKeyword(clause, 'INTO') && owner?.kind === 'identifier'))
    ) {
      return true
    }
  }
  return (
    isKeyword(clause, 'SET') &&
    (previous === clause || (isPunctuation(previous, ',') && open < clauseAt))
  )
}

const expectsAfter = (
  previous: Token | undefined,
  beforePrevious: Token | undefined,
  clause: string
): 'table' | 'column' | 'number' | 'any' => {
  if (
    isKeyword(previous, ...TABLE_INTRODUCERS) ||
    (isPunctuation(previous, ',') && clause === 'FROM')
  ) {
    return 'table'
  }
  if (isKeyword(previous, 'LIMIT', 'OFFSET')) {
    return 'number'
  }
  if (
    isKeyword(previous, ...COLUMN_INTRODUCERS) ||
    (isKeyword(previous, 'NOT') && !isTerm(beforePrevious)) ||
    isPunctuation(previous, ',') ||
    isPunctuation(previous, '(') ||
    previous?.kind === 'operator'
  ) {
    return 'column'
  }
  return 'any'
}

const expectsAt = ({
  beforePrevious,
  clause,
  clauseAt,
  clauses,
  flat,
  opens,
  previous,
}: {
  beforePrevious: Token | undefined
  clause: string
  clauseAt: number
  clauses: string[]
  flat: Token[]
  opens: number[]
  previous: Token | undefined
}): CompletionContext['expects'] => {
  if (flat.length === 0) {
    return 'statement'
  }
  if (clauses.length > 0) {
    return 'clause'
  }
  if (namesTargetColumn(flat, opens, clauseAt)) {
    return 'target-column'
  }
  if (awaitsOperator(flat, clause)) {
    return 'operator'
  }
  return expectsAfter(previous, beforePrevious, clause)
}

const templateAfter = (
  previous: Token | undefined,
  beforePrevious: Token | undefined,
  clause: string,
  expects: CompletionContext['expects']
): CompletionContext['template'] => {
  if (isKeyword(previous, 'SELECT', 'DISTINCT')) {
    return 'select'
  }
  if (isKeyword(previous, 'BY') && isKeyword(beforePrevious, 'GROUP')) {
    return 'group-by'
  }
  if (isKeyword(previous, 'ON') && clause === 'ON') {
    return 'join-on'
  }
  if (expects === 'clause' && clause === 'INTO') {
    return 'into'
  }
  return null
}

const comparedColumnBefore = (
  before: Token[],
  cursor: number,
  expects: CompletionContext['expects']
) =>
  expects === 'operator'
    ? columnRefAt(before, cursor)
    : columnBeforeValue(before, cursor)

export const completionContext = (
  text: string,
  offset: number,
  dialect: DialectSpec
): CompletionContext => {
  const { tokens } = tokenize(text, dialect)
  const statement = statementAt(
    statementsFromTokens(text, tokens, dialect),
    offset,
    text
  )
  const word = wordAt(tokens, offset)
  const literal = literalAt(tokens, offset)
  const quoted = stringContentRange(literal)
  const caret = literal?.start ?? word?.start ?? offset
  const scope = statementScope(statement?.tokens ?? [], caret)
  const before = tokens.filter(
    (token) => token.kind !== 'comment' && token.end <= caret
  )

  const { cursor, qualifier } = qualifierBefore(before)

  const previous = before[cursor]
  const beforePrevious = before[cursor - 1]
  const statementTokens = statement
    ? before.filter((token) => token.start >= statement.start)
    : []
  const { clause, clauseAt, flat, lastKeyword, nested, opens, verb } =
    readClause(statementTokens)
  const clauses = nextClauses(flat, clause, verb, nested, dialect)
  const expects = expectsAt({
    beforePrevious,
    clause,
    clauseAt,
    clauses,
    flat,
    opens,
    previous,
  })

  const replace = quoted ?? {
    end: word?.end ?? offset,
    start: word?.start ?? offset,
  }
  const prefix = text.slice(replace.start, offset)
  const caseSample = prefix || lastKeyword?.text || ''

  return {
    clauses,
    comparedColumn:
      literal && !quoted ? null : comparedColumnBefore(before, cursor, expects),
    expects,
    inLiteral: literal !== undefined,
    keywordCase:
      caseSample === caseSample.toLowerCase() &&
      caseSample !== caseSample.toUpperCase()
        ? 'lower'
        : 'upper',
    prefix,
    qualifier,
    replaceEnd: replace.end,
    replaceStart: replace.start,
    scope,
    selectedColumns: selectedColumns(statementTokens),
    template: templateAfter(previous, beforePrevious, clause, expects),
  }
}
