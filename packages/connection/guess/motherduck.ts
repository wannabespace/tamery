import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { decodeURIComponentOrRaw } from '@tamery/shared/utils'

import { variablesOfLines } from './env'
import { mergeParts } from './parts'
import type { DatabaseGuess, GuessedParts } from './types'
import { parsedUrlsIn } from './url'

const MOTHERDUCK_DOMAIN = '.motherduck.com'
/** The endpoint's name for the whole workspace, which Tamery spells as no database. */
const WORKSPACE_DATABASE = /^md:/iu
/** `md:my_db?motherduck_token=…`, the string MotherDuck's own clients take, also behind `jdbc:duckdb:`. */
const MD_STRING =
  /(?<![\w/])(?:jdbc:duckdb:)?(?:md|motherduck):(?!\/\/)(?<database>[^\s?"'`]*)(?:\?(?<params>[^\s"'`]*))?/iu
const TOKEN_PARAM = 'motherduck_token'
const TOKEN_KEYS = ['MOTHERDUCK_TOKEN', 'MOTHERDUCK_ACCESS_TOKEN']

/** A Postgres client's URL to the endpoint; the endpoint's own user is always `postgres`, so only the token is kept. */
const endpointUrl = (text: string): GuessedParts | null => {
  const url = parsedUrlsIn(text).find(({ hostname }) =>
    hostname.toLowerCase().endsWith(MOTHERDUCK_DOMAIN)
  )
  return url
    ? {
        database: decodeURIComponentOrRaw(url.pathname.slice(1)).replace(
          WORKSPACE_DATABASE,
          ''
        ),
        host: url.hostname,
        password: decodeURIComponentOrRaw(url.password),
      }
    : null
}

const mdString = (text: string): GuessedParts | null => {
  const groups = MD_STRING.exec(text)?.groups
  return groups
    ? {
        database: decodeURIComponentOrRaw(groups.database ?? ''),
        password:
          new URLSearchParams(groups.params).get(TOKEN_PARAM) ?? undefined,
      }
    : null
}

const tokenVariable = (text: string): GuessedParts | null => {
  const variables = variablesOfLines(text.split('\n'))
  const token = TOKEN_KEYS.map((key) => variables[key]).find(Boolean)
  return token ? { password: token } : null
}

const motherduck = (parts: GuessedParts, text: string) =>
  mergeParts(
    parts,
    { password: tokenVariable(text)?.password },
    { provider: Provider.MotherDuck, type: ConnectionType.DuckDB }
  )

/** MotherDuck hands out an `md:` string or a Postgres URL to its endpoint; without the URL, the token names the region. */
export const guessMotherduck = (text: string): DatabaseGuess | null => {
  const parts = endpointUrl(text) ?? mdString(text)
  return parts ? { format: 'url', parts: motherduck(parts, text) } : null
}

/** A token on its own, checked after every URL so an `.env` naming another database keeps it. */
export const guessMotherduckToken = (text: string): DatabaseGuess | null => {
  const parts = tokenVariable(text)
  return parts ? { format: 'env', parts: motherduck(parts, text) } : null
}
