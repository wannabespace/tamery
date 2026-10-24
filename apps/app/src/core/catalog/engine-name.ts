import type { Dialect } from '@tamery/shared/enums/connection-type'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { dialects } from '@tamery/sql'

/** Spells a name the way the engine stores it unquoted, so Oracle never gets a lower-case name every later reference must quote. */
export const engineName = (dialect: Dialect, name: string) =>
  isSqlDialect(dialect) && dialects[dialect].nameCase === 'upper'
    ? name.toUpperCase()
    : name

export const suggestedName = (dialect: Dialect, parts: string[]) =>
  engineName(dialect, parts.join('_'))

/** A name left as the database stores it keeps its spelling, so opening an existing object never turns its save into a rename. */
export const submittedName = (
  dialect: Dialect,
  typed: string,
  stored: { name: string } | null
) => {
  const name = typed.trim()
  return name === stored?.name ? name : engineName(dialect, name)
}
