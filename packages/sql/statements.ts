import type { DialectSpec } from './dialect'
import type { Token } from './tokenizer'
import { isKeyword, isPunctuation, tokenize } from './tokenizer'

export interface Statement {
  text: string
  start: number
  end: number
  terminatorEnd: number
  tokens: Token[]
}

// Matched by text: most are not keywords in any dialect's list.
const TRANSACTION_OPENERS = new Set([
  ';',
  'DEFERRABLE',
  'DEFERRED',
  'DISTRIBUTED',
  'EXCLUSIVE',
  'IMMEDIATE',
  'ISOLATION',
  'READ',
  'TRAN',
  'TRANSACTION',
  'WORK',
])
const WHOLE_STATEMENT_ENDINGS = new Set([undefined, 'TRANSACTION', 'WORK'])
const ACCESS_MODES = ['read only', 'read write'] as const
const ISOLATION_LEVELS = [
  'read uncommitted',
  'read committed',
  'repeatable read',
  'serializable',
  'snapshot',
] as const

const GO_REPEAT_COUNT = /^\s*\d*\s*$/u
const BLANK = /^\s*$/u

const separatorRest = (token: Token, dialect: DialectSpec) => {
  if (dialect.goBatches && isKeyword(token, 'GO')) {
    return GO_REPEAT_COUNT
  }
  return dialect.plsqlUnits && token.text === '/' ? BLANK : null
}

export const separatorLineEnd = (
  text: string,
  tokens: Token[],
  index: number,
  dialect: DialectSpec
) => {
  const token = tokens[index]
  const previous = tokens[index - 1]
  const rest = token && separatorRest(token, dialect)
  if (!(token && rest)) {
    return null
  }
  const lineEnd = text.indexOf('\n', token.end) + 1 || text.length
  const startsLine =
    previous === undefined ||
    text.slice(previous.end, token.start).includes('\n')
  return startsLine && rest.test(text.slice(token.end, lineEnd))
    ? lineEnd
    : null
}

const upperTexts = (tokens: Token[]) =>
  tokens.map((token) => token.text.toUpperCase())

const PLSQL_UNITS = new Set([
  'FUNCTION',
  'PACKAGE',
  'PROCEDURE',
  'TRIGGER',
  'TYPE',
])
const CREATE_MODIFIERS = new Set([
  'OR',
  'REPLACE',
  'EDITIONABLE',
  'NONEDITIONABLE',
])

const startsPlsqlUnit = (tokens: Token[], index: number) => {
  const [word, ...rest] = upperTexts(tokens.slice(index, index + 5))
  if (word === 'DECLARE' || word === 'BEGIN') {
    return true
  }
  const unit = rest.find((next) => !CREATE_MODIFIERS.has(next))
  return word === 'CREATE' && unit !== undefined && PLSQL_UNITS.has(unit)
}

const opensTransactionAt = (tokens: Token[], index: number) => {
  const [word, next, after] = upperTexts(tokens.slice(index, index + 3))
  if (word === 'START') {
    return next === 'TRANSACTION'
  }
  if (next === 'NOT') {
    return word === 'BEGIN' && after === 'DEFERRABLE'
  }
  return (
    word === 'BEGIN' && (next === undefined || TRANSACTION_OPENERS.has(next))
  )
}

const transactionCloser = (tokens: Token[]) => {
  const words = upperTexts(tokens.slice(0, 3))
  const [word, next, after] = words
  if (word === 'COMMIT' || (word === 'ROLLBACK' && !words.includes('TO'))) {
    return word
  }
  if (
    (word === 'END' || word === 'ABORT') &&
    after === undefined &&
    WHOLE_STATEMENT_ENDINGS.has(next)
  ) {
    return word
  }
}

const isColumnPosition = (previous: Token | undefined) =>
  isKeyword(previous, 'SELECT') ||
  isPunctuation(previous, ',') ||
  isPunctuation(previous, '(')

export const leavesTransactionOpen = (text: string, dialect: DialectSpec) => {
  const tokens = tokenize(text, dialect).tokens.filter(
    (token) => token.kind !== 'comment'
  )
  return (
    opensTransactionAt(tokens, 0) &&
    !tokens.some((_, index) => transactionCloser(tokens.slice(index)))
  )
}

export const endsTransaction = (text: string, dialect: DialectSpec) =>
  !!transactionCloser(
    tokenize(text, dialect).tokens.filter((token) => token.kind !== 'comment')
  )

const namesColumn = (tokens: Token[], index: number) => {
  const previous = tokens[index - 1]
  const next = tokens[index + 1]
  return (
    isColumnPosition(previous) ||
    isKeyword(previous, 'BY') ||
    next?.kind === 'operator' ||
    isPunctuation(next, ',') ||
    isPunctuation(next, ')')
  )
}

/** `END CASE` closes the CASE its END already counted. */
const blockDepthChange = (
  tokens: Token[],
  index: number,
  dialect: DialectSpec
) => {
  const token = tokens[index]
  const previous = tokens[index - 1]
  if (isPunctuation(previous, '.')) {
    return 0
  }
  if (
    (isKeyword(token, 'CASE') && !isKeyword(previous, 'END')) ||
    (isKeyword(token, 'BEGIN') && !namesColumn(tokens, index))
  ) {
    return 1
  }
  return isKeyword(token, 'END') &&
    !dialect.blockEndQualifiers.includes(
      tokens[index + 1]?.text.toUpperCase() ?? ''
    )
    ? -1
    : 0
}

export const statementsFromTokens = (
  text: string,
  tokens: Token[],
  dialect: DialectSpec,
  { groupTransactions = true }: { groupTransactions?: boolean } = {}
): Statement[] => {
  const statements: Statement[] = []
  const significant = tokens.filter((token) => token.kind !== 'comment')
  const groups = groupTransactions && dialect.transactions
  let current: Token[] = []
  let innerStart = 0
  let depth = 0
  let inTransaction = false
  let inPlsqlUnit = false

  const flush = (terminator?: Token) => {
    const [first] = current
    const last = current.at(-1)
    if (inTransaction && !transactionCloser(current.slice(innerStart))) {
      statements.push(
        ...statementsFromTokens(text, current, dialect, {
          groupTransactions: false,
        })
      )
    } else if (first && last) {
      statements.push({
        end: last.end,
        start: first.start,
        terminatorEnd: terminator?.end ?? last.end,
        text: text.slice(first.start, last.end),
        tokens: current,
      })
    }
    current = []
    innerStart = 0
    depth = 0
    inTransaction = false
    inPlsqlUnit = false
  }

  let separatorEnd = 0

  for (const [index, token] of significant.entries()) {
    if (token.start < separatorEnd) {
      continue
    }
    const lineEnd = separatorLineEnd(text, significant, index, dialect)
    if (lineEnd) {
      separatorEnd = lineEnd
      flush()
      continue
    }

    if (
      dialect.plsqlUnits &&
      current.length === 0 &&
      startsPlsqlUnit(significant, index)
    ) {
      inPlsqlUnit = true
    } else if (opensTransactionAt(significant, index)) {
      inTransaction = groups
    } else {
      depth = Math.max(0, depth + blockDepthChange(significant, index, dialect))
    }

    if (isPunctuation(token, ';') && depth === 0 && !inPlsqlUnit) {
      if (!inTransaction || transactionCloser(current.slice(innerStart))) {
        flush(token)
        continue
      }
      innerStart = current.length + 1
    }

    current.push(token)
  }

  flush()
  return statements
}

export const splitStatements = (
  text: string,
  dialect: DialectSpec,
  options?: { groupTransactions?: boolean }
) =>
  statementsFromTokens(text, tokenize(text, dialect).tokens, dialect, options)

export const unwrapTransaction = (text: string, dialect: DialectSpec) => {
  if (!dialect.transactions) {
    return null
  }
  const parts = splitStatements(text, dialect, { groupTransactions: false })
  const [first] = parts
  const ending = transactionCloser(parts.at(-1)?.tokens ?? [])
  if (!(first && ending && opensTransactionAt(first.tokens, 0))) {
    return null
  }
  const opener = first.text.toLowerCase().replaceAll(/\s+/gu, ' ')
  return {
    accessMode: ACCESS_MODES.find((mode) => opener.includes(mode)),
    commit: ending === 'COMMIT' || ending === 'END',
    isolationLevel: ISOLATION_LEVELS.find((level) =>
      opener.includes(`isolation level ${level}`)
    ),
    statements: parts.slice(1, -1).map((part) => part.text),
  }
}

export const statementAt = (
  statements: Statement[],
  offset: number,
  text: string
) =>
  statements.findLast(
    ({ start, terminatorEnd }) =>
      offset >= start &&
      (offset <= terminatorEnd ||
        !text.slice(terminatorEnd, offset).includes('\n'))
  )
