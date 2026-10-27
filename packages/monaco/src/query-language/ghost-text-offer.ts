import type { DialectSpec } from '@tamery/sql'
import { splitStatements } from '@tamery/sql'

const TRAILING_WORD = /\w+$/u
const LEADING_WORD = /^\w+/u
const LEADING_SPACE = /^\s/u

export const needsLeadingSpace = (
  before: string,
  reply: string,
  explicit: boolean,
  dialect: DialectSpec
) => {
  const typed = TRAILING_WORD.exec(before)?.[0]
  if (!typed) {
    return false
  }
  // An explicit ask sends the model a space after the word, so its reply, `*` included, follows one.
  if (explicit) {
    return !LEADING_SPACE.test(reply)
  }
  const next = LEADING_WORD.exec(reply)?.[0]
  if (!next) {
    return false
  }
  const known = (word: string) => {
    const upper = word.toUpperCase()
    return (
      dialect.keywords.has(upper) ||
      dialect.functions.has(upper) ||
      dialect.types.has(upper)
    )
  }
  return known(next) && !known(typed + next)
}

export const withinStatement = (
  before: string,
  reply: string,
  dialect: DialectSpec
) => {
  const statement = splitStatements(before + reply, dialect, {
    groupTransactions: false,
  }).find(({ terminatorEnd }) => terminatorEnd > before.length)
  return statement && statement.terminatorEnd > statement.end
    ? reply.slice(0, statement.terminatorEnd - before.length)
    : reply
}

export interface GhostTextOffer {
  after: string
  before: string
  text: string
}

export const typedAlong = (
  offer: GhostTextOffer,
  typed: string,
  offset: number
) => {
  const before = typed.slice(0, offset)
  const after = typed.slice(offset)
  if (!before.startsWith(offer.before) || !after.endsWith(offer.after)) {
    return
  }
  const typedPart = before.slice(offer.before.length)
  const autoClosed = after.slice(0, after.length - offer.after.length)
  const rest = offer.text.slice(typedPart.length)
  return offer.text.startsWith(typedPart) &&
    rest.endsWith(autoClosed) &&
    rest.length > autoClosed.length
    ? rest.slice(0, rest.length - autoClosed.length)
    : undefined
}
