import type { DialectSpec } from '@tamery/sql'
import { splitStatements, statementAt, tokenize } from '@tamery/sql'

import { needsLeadingSpace, withinStatement } from './ghost-text-offer'

export const neighbourhood = <T extends { terminatorEnd: number }>(
  statements: T[],
  statement: T | undefined,
  length: number
) => {
  const index = statement ? statements.indexOf(statement) : -1
  if (index === -1) {
    return { end: length, start: 0 }
  }
  return {
    end: statements[index + 1]?.terminatorEnd ?? length,
    // From the end of the statement before, so comments leading into the previous one come along.
    start: statements[index - 2]?.terminatorEnd ?? 0,
  }
}

/** What differs per query language in the shared ghost-text flow: the statement window, string detection, and judging the model's reply. */
export interface GhostTextLanguage {
  window: (text: string, offset: number) => { end: number; start: number }
  inString: (before: string) => boolean
  trimToStatement: (before: string, reply: string) => string
  looksInvalid: (suggestion: string) => boolean
  needsLeadingSpace: (
    before: string,
    reply: string,
    explicit: boolean
  ) => boolean
}

// `?` stays out: it is Postgres's jsonb key-exists operator.
const NOT_SQL = /[.!:…]\s|[.!:…]$|```|^\(empty response\b/iu

export const sqlGhostLanguage = (dialect: DialectSpec): GhostTextLanguage => ({
  inString: (before) => {
    const { state } = tokenize(before, dialect)
    // A `$$` body is code, not a string value.
    return state.kind === 'string' && !state.close.startsWith('$')
  },
  looksInvalid: (suggestion) => NOT_SQL.test(suggestion),
  needsLeadingSpace: (before, reply, explicit) =>
    needsLeadingSpace(before, reply, explicit, dialect),
  trimToStatement: (before, reply) => withinStatement(before, reply, dialect),
  window: (text, offset) => {
    const statements = splitStatements(text, dialect)
    return neighbourhood(
      statements,
      statementAt(statements, offset, text),
      text.length
    )
  },
})
