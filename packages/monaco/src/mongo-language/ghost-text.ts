import { codeChars } from '@tamery/mongo/lexer'
import { splitStatements, statementAt } from '@tamery/mongo/statements'

import type { GhostTextLanguage } from '../query-language/ghost-text'
import { neighbourhood } from '../query-language/ghost-text'

// mongosh uses `.` and `:` as syntax, so the SQL punctuation check does not apply; only prose and fences are rejected.
const NOT_MONGO = /```|^\(empty response\b/iu

export const mongoGhostLanguage = (): GhostTextLanguage => ({
  inString: (before) => codeChars(before).state.open === 'string',
  looksInvalid: (suggestion) => NOT_MONGO.test(suggestion),
  needsLeadingSpace: () => false,
  trimToStatement: (before, reply) => {
    const statement = splitStatements(before + reply).find(
      ({ terminatorEnd }) => terminatorEnd > before.length
    )
    return statement && statement.terminatorEnd > statement.end
      ? reply.slice(0, statement.terminatorEnd - before.length)
      : reply
  },
  window: (text, offset) => {
    const statements = splitStatements(text)
    return neighbourhood(
      statements,
      statementAt(statements, offset, text),
      text.length
    )
  },
})
