import { codeChars } from '@tamery/mongo/lexer'
import { splitStatements, statementAt } from '@tamery/mongo/statements'

import type { GhostTextLanguage } from '../query-language/ghost-text-language'
import { neighbourhood } from '../query-language/ghost-text-language'

// mongosh uses `.` and `:` as syntax, so the SQL punctuation check does not apply; only prose and fences are rejected.
const NOT_MONGO = /```|^\(empty response\b/iu

// The runner executes only db.<collection>.<method>(…) chains (see @tamery/mongo/parse), so a suggestion of shell JS it cannot run — a function body, an arrow, or cursor iteration like forEach/map — is dropped rather than offered and then failing on Run.
const UNRUNNABLE_JS = /\bfunction\b|=>|\.(?:forEach|map|filter|reduce)\s*\(/u

export const mongoGhostLanguage = (): GhostTextLanguage => ({
  inString: (before) => codeChars(before).state.open === 'string',
  looksInvalid: (suggestion) =>
    NOT_MONGO.test(suggestion) || UNRUNNABLE_JS.test(suggestion),
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
