import { ConnectionType } from '@tamery/shared/enums/connection-type'

import {
  CLICKHOUSE_HTTP_PORT_OF_NATIVE,
  connectionParts,
  getConnectionType,
  HTTPS_PORT,
} from '../connection-parts'
import { getHostHint } from '../hosts'
import { adoPairs, adoParts } from './ado'
import type { DatabaseGuess } from './types'

const URL_PATTERN = /(?:jdbc:)?(?<scheme>[a-z][\w+.-]*):\/\/[^\s"'`<>]+/giu
/** Keeps the `]` that closes an IPv6 host (`postgres://[::1]`). */
const TRAILING_PUNCTUATION = /(?<!\[[\da-f:.%]*)[.,;:)\]]+$/iu
const WEB_SCHEME = /^https?:/iu
const SECURE_VALUES = new Set(['1', 'true'])
const SEMICOLON_URL =
  /^(?:sqlserver|mssql):\/\/(?<address>[^;/?]*);(?<props>.*)$/iu
const MONGODB_SEED_LIST =
  /^(?<head>mongodb:\/\/(?:[^@/]*@)?[^,/?]+)(?:,[^,/?]+)+/iu

const takeParam = (params: URLSearchParams, keys: string[]) => {
  const value = keys.map((key) => params.get(key)).find(Boolean) ?? ''
  for (const key of keys) {
    params.delete(key)
  }
  return value
}

interface FoundUrl {
  type: ConnectionType
  url: string
}

const guessOfUrl = ({ type, url: candidate }: FoundUrl): DatabaseGuess => {
  const format = candidate.toLowerCase().startsWith('jdbc:') ? 'jdbc' : 'url'
  const url = candidate.replace(/^jdbc:/iu, '')

  const semicolonUrl = SEMICOLON_URL.exec(url)?.groups
  if (semicolonUrl) {
    const pairs = adoPairs(semicolonUrl.props ?? '')
    if (semicolonUrl.address) {
      pairs.set('server', semicolonUrl.address.replace(':', ','))
    }
    return {
      format,
      parts: { ...adoParts(pairs), type: ConnectionType.MSSQL },
    }
  }

  // A URL holds one host; the driver finds the rest of a replica set from any member, so the first seed is enough.
  const parts = connectionParts.parse(url.replace(MONGODB_SEED_LIST, '$<head>'))
  const params = new URLSearchParams(parts.options)
  const user = takeParam(params, ['user', 'username'])
  const password = takeParam(params, ['password'])
  const database = takeParam(params, ['database', 'databasename', 'dbname'])
  // clickhouse-go's DSN names the transport in `secure`; the ClickHouse client refuses any parameter it does not know.
  const secure =
    type === ConnectionType.ClickHouse ? takeParam(params, ['secure']) : ''
  const https = secure ? SECURE_VALUES.has(secure.toLowerCase()) : parts.https

  return {
    format,
    parts: {
      ...parts,
      database: parts.database || database,
      https,
      options: params.toString(),
      password: parts.password || password,
      port: !parts.port && https ? HTTPS_PORT : parts.port,
      type,
      user: parts.user || user,
    },
  }
}

const urlsIn = (text: string): FoundUrl[] =>
  [...text.matchAll(URL_PATTERN)].flatMap(({ 0: match, groups }) => {
    const type = getConnectionType(groups?.scheme ?? '')
    return type ? [{ type, url: match.replace(TRAILING_PUNCTUATION, '') }] : []
  })

/** Every URL in the text whatever its scheme, so a provider can read its own links. */
export const parsedUrlsIn = (text: string) =>
  [...text.matchAll(URL_PATTERN)].flatMap(
    ({ 0: match }) => URL.parse(match.replace(TRAILING_PUNCTUATION, '')) ?? []
  )

export const guessUrl = (text: string): DatabaseGuess | null => {
  const found = urlsIn(text).find(({ url }) => !WEB_SCHEME.test(url))
  return found ? guessOfUrl(found) : null
}

const GO_DSN =
  /(?<user>[^\s:@/"'=]*)(?::(?<password>[^\s@"']*))?@tcp\((?<host>[^\s():]+)(?::(?<port>\d+))?\)\/(?<database>[^\s?"']*)/u

export const guessGoDsn = (text: string): DatabaseGuess | null => {
  const groups = GO_DSN.exec(text)?.groups
  return groups
    ? { format: 'url', parts: { ...groups, type: ConnectionType.MySQL } }
    : null
}

const CLICKHOUSE_NAME = /clickhouse/iu
const MULTI_SEGMENT_PATH = /^\/[^/]+\/./u

/**
 * Any page link is http(s) too, so it needs ClickHouse evidence unless `isConnection` says the text names a database;
 * keep it after the other detectors or any `APP_URL=https://…` wins.
 */
export const guessWebUrl = (
  text: string,
  context = text,
  isConnection = false
): DatabaseGuess | null => {
  const found = urlsIn(text).find(({ url }) => {
    if (!WEB_SCHEME.test(url)) {
      return false
    }
    const { hostname, pathname, port } = URL.parse(url) ?? {}
    return (
      !MULTI_SEGMENT_PATH.test(pathname ?? '') &&
      (isConnection ||
        Object.values(CLICKHOUSE_HTTP_PORT_OF_NATIVE).includes(port ?? '') ||
        getHostHint(hostname ?? '')?.type === ConnectionType.ClickHouse ||
        CLICKHOUSE_NAME.test(context.replace(url, '')))
    )
  })
  return found ? guessOfUrl(found) : null
}
