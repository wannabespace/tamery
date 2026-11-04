import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { Result } from 'better-result'

import { CLICKHOUSE_HTTP_PORT_OF_NATIVE } from '../connection-parts'
import { getBareHostProvider, getHostHint, TYPE_OF_PORT } from '../hosts'
import { guessAdo } from './ado'
import { guessCli } from './cli'
import { guessEnv } from './env'
import { fixParts } from './fixes'
import { guessHost, guessPgpass } from './host'
import { guessJson } from './json'
import { guessKeyValue } from './key-value'
import { guessOracle } from './oracle'
import { mergeParts } from './parts'
import { guessRemoteSqlite } from './remote-sqlite'
import { guessSqlite } from './sqlite'
import { guessSsh, throughForwards } from './ssh'
import type { ConnectionGuess, DatabaseGuess, GuessFix } from './types'
import { guessGoDsn, guessUrl, guessWebUrl } from './url'

export type { ConnectionGuess, GuessFix, GuessFormat } from './types'

const getDetectors = (isConnection: boolean) => [
  guessSqlite,
  guessCli,
  guessJson,
  guessUrl,
  guessGoDsn,
  guessOracle,
  guessAdo,
  guessKeyValue,
  guessRemoteSqlite,
  guessEnv,
  (text: string) => guessWebUrl(text, text, isConnection),
  guessPgpass,
  guessHost,
]
const LINE_CONTINUATION = /\\\r?\n/gu

const credentialsBeside = (
  database: DatabaseGuess | null | undefined,
  text: string
) => {
  if (database?.format !== 'url' && database?.format !== 'jdbc') {
    return {}
  }
  const { password, user } = guessEnv(text)?.parts ?? {}
  return { password, user }
}

/** `isConnection`: the text is known to name a database (a Host field, a found server), so a bare http(s) URL is ClickHouse. */
export const guessConnection = (
  text: string,
  isConnection = false
): ConnectionGuess | null =>
  Result.try(() => {
    const { forwards, rest, tunnel } = guessSsh(
      text.replaceAll(LINE_CONTINUATION, ' ')
    )
    const database = getDetectors(isConnection)
      .values()
      .map((detect) => detect(rest))
      .find(Boolean)
    if (!database && !tunnel) {
      return null
    }

    const pasted = mergeParts(
      { ssh: tunnel },
      database?.parts ?? {},
      credentialsBeside(database, rest)
    )
    const parts = throughForwards(pasted, forwards)
    const hint = getHostHint(parts.host ?? '')
    const port = parts.port || hint?.port || ''
    const type = parts.type ?? TYPE_OF_PORT[port] ?? hint?.type
    const httpPort =
      type === ConnectionType.ClickHouse && CLICKHOUSE_HTTP_PORT_OF_NATIVE[port]
    const { fixes, parts: fixed } = fixParts(
      mergeParts(
        { ...parts, port: httpPort || port, type },
        { provider: getBareHostProvider(parts) }
      )
    )
    const routingFixes: GuessFix[] = [
      ...(pasted.host && parts !== pasted ? (['ssh-forward'] as const) : []),
      ...(httpPort ? (['clickhouse-http'] as const) : []),
    ]
    return {
      fixes: [...routingFixes, ...fixes],
      format: database?.format ?? 'ssh',
      parts: fixed,
    }
  }).unwrapOr(null)
