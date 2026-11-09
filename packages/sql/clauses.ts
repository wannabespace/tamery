import type { DialectSpec } from './dialect'
import type { Token } from './tokenizer'
import { isKeyword, isPunctuation } from './tokenizer'

const SELECT_TAIL = ['GROUP BY', 'ORDER BY', 'LIMIT']
const JOINS = [
  'JOIN',
  'LEFT JOIN',
  'INNER JOIN',
  'RIGHT JOIN',
  'FULL JOIN',
  'CROSS JOIN',
]
const ORDERING_TAIL = ['NULLS FIRST', 'NULLS LAST', 'LIMIT', 'OFFSET']
const CONFLICT_ACTIONS = ['DO NOTHING', 'DO UPDATE SET']

const NEXT_CLAUSES: Record<string, string[]> = {
  AND: ['AND', 'OR', ...SELECT_TAIL],
  ASC: ORDERING_TAIL,
  CONFLICT: CONFLICT_ACTIONS,
  DESC: ORDERING_TAIL,
  FIRST: ['LIMIT', 'OFFSET'],
  FROM: ['WHERE', ...JOINS, ...SELECT_TAIL],
  'GROUP BY': ['HAVING', 'ORDER BY', 'LIMIT'],
  HAVING: ['AND', 'OR', 'ORDER BY', 'LIMIT'],
  INTO: ['VALUES', 'SELECT'],
  JOIN: ['ON', 'AS'],
  LAST: ['LIMIT', 'OFFSET'],
  LIMIT: ['OFFSET'],
  NOTHING: ['RETURNING'],
  ON: ['AND', 'OR', 'WHERE', 'JOIN', 'LEFT JOIN', ...SELECT_TAIL],
  OR: ['AND', 'OR', ...SELECT_TAIL],
  'ORDER BY': ['ASC', 'DESC', ...ORDERING_TAIL],
  SELECT: ['FROM', 'AS'],
  SET: ['WHERE', 'RETURNING'],
  UPDATE: ['SET'],
  VALUES: ['ON CONFLICT', 'ON DUPLICATE KEY UPDATE', 'RETURNING'],
  WHERE: ['AND', 'OR', ...SELECT_TAIL],
}

const FOLLOWERS: Record<string, string[]> = {
  CONFLICT: CONFLICT_ACTIONS,
  DO: ['NOTHING', 'UPDATE SET'],
  IS: ['NULL', 'NOT NULL', 'TRUE', 'FALSE'],
  'IS NOT': ['NULL', 'TRUE', 'FALSE'],
  NOT: ['IN (', 'LIKE', 'ILIKE', 'BETWEEN'],
  NULLS: ['FIRST', 'LAST'],
}

const SELECT_ONLY = new Set([...JOINS, 'HAVING', ...SELECT_TAIL])
const ENDS_IN_RETURNING = new Set(['AND', 'FROM', 'OR', 'WHERE'])
export const CONDITION_CLAUSES = new Set(['AND', 'HAVING', 'ON', 'OR', 'WHERE'])
const COMPARISON_KEYWORDS = [
  'BETWEEN',
  'EXISTS',
  'ILIKE',
  'IN',
  'IS',
  'LIKE',
  'NOT',
]
const CONDITION_STARTERS = [...CONDITION_CLAUSES, 'NOT']
const TERM_KEYWORDS = [
  'ASC',
  'DESC',
  'FALSE',
  'FIRST',
  'LAST',
  'NOTHING',
  'NULL',
  'TRUE',
]
const WORD = /^\w+$/u

export const isTerm = (token: Token | undefined) =>
  token !== undefined &&
  (['identifier', 'number', 'string', 'variable'].includes(token.kind) ||
    isPunctuation(token, ')') ||
    isKeyword(token, ...TERM_KEYWORDS))

/** `flat` has every closed parenthesis group emptied, so a group reads `(` `)`. */
const termBefore = (flat: Token[], end = flat.length) => {
  let index = end - 1
  const closesGroup = isPunctuation(flat[index], ')')
  if (closesGroup) {
    index -= 1
  }
  const call =
    closesGroup &&
    ['function', 'identifier', 'type'].includes(flat[index - 1]?.kind ?? '')
  if (!closesGroup || call) {
    index -= closesGroup ? 1 : 0
    while (
      isPunctuation(flat[index - 1], '.') &&
      flat[index - 2]?.kind === 'identifier'
    ) {
      index -= 2
    }
  }
  return { at: index - 1, group: closesGroup && !call }
}

export const completesCondition = (flat: Token[]) => {
  const term = termBefore(flat)
  const before = flat[term.at]
  if (isKeyword(before, 'AND')) {
    return isKeyword(flat[termBefore(flat, term.at).at], 'BETWEEN')
  }
  return (
    before?.kind === 'operator' ||
    (isKeyword(before, ...COMPARISON_KEYWORDS) &&
      !isKeyword(before, 'BETWEEN')) ||
    (term.group &&
      (isKeyword(before, ...CONDITION_STARTERS) || isPunctuation(before, '(')))
  )
}

const spoken = (clause: string, dialect: DialectSpec) =>
  clause
    .split(' ')
    .every((word) => !WORD.test(word) || dialect.keywords.has(word))

/** `nested`: the caret sits in a parenthesized group opened after the clause, where only `AND`/`OR` can continue it. */
export const nextClauses = (
  flat: Token[],
  clause: string,
  verb: string,
  nested: boolean,
  dialect: DialectSpec
) => {
  const [beforePrevious, previous] = flat.slice(-2)
  const followed =
    isKeyword(previous, 'NOT') && isKeyword(beforePrevious, 'IS')
      ? 'IS NOT'
      : (previous?.text.toUpperCase() ?? '')
  if (
    previous?.kind === 'keyword' &&
    FOLLOWERS[followed] &&
    (followed !== 'NOT' || isTerm(beforePrevious))
  ) {
    return FOLLOWERS[followed].filter((next) => spoken(next, dialect))
  }
  const selectsAll =
    previous?.text === '*' && isKeyword(beforePrevious, 'SELECT')
  if (!isTerm(previous) && !selectsAll) {
    return []
  }
  const term = termBefore(flat)
  if (isKeyword(flat[term.at], 'BETWEEN')) {
    return ['AND']
  }
  if (CONDITION_CLAUSES.has(clause) && !completesCondition(flat)) {
    return []
  }
  const next = (NEXT_CLAUSES[clause] ?? []).filter(
    (item) => !nested || item === 'AND' || item === 'OR'
  )
  const clauses =
    verb === 'SELECT'
      ? next
      : [
          ...next.filter((item) => !SELECT_ONLY.has(item)),
          ...(ENDS_IN_RETURNING.has(clause) ? ['RETURNING'] : []),
        ]
  return clauses.filter((item) => spoken(item, dialect))
}
