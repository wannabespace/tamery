import { getDialect, Dialect } from '@tamery/shared/enums/connection-type'

import type { ConnectionParts } from '../connection-parts'
import { TLS_PARAMS as MONGODB_TLS_PARAMS } from './mongodb'
import { TLS_PARAMS as MYSQL_TLS_PARAMS } from './mysql'
import { TLS_PARAMS as PG_TLS_PARAMS } from './pg'

export type SslSetting = 'off' | 'on' | 'unverified'

// Sync with the options `ssl/<engine>.ts` parses.
const SSL_OPTIONS: Partial<
  Record<Dialect, Partial<Record<SslSetting, string>>>
> = {
  [Dialect.MSSQL]: {
    off: 'encrypt=false',
    on: 'encrypt=true',
    unverified: 'trustservercertificate=true',
  },
  [Dialect.MongoDB]: {
    off: 'tls=false',
    on: 'tls=true',
    unverified: 'tls=true&tlsallowinvalidcertificates=true',
  },
  [Dialect.MySQL]: { off: 'ssl=false', on: 'ssl=true' },
  [Dialect.Oracle]: { off: 'ssl=false', on: 'ssl=true' },
  [Dialect.Postgres]: {
    off: 'sslmode=disable',
    on: 'sslmode=require',
    unverified: 'sslmode=no-verify',
  },
}

const TLS_PARAMS: Partial<Record<Dialect, string[]>> = {
  [Dialect.MongoDB]: MONGODB_TLS_PARAMS,
  [Dialect.MySQL]: MYSQL_TLS_PARAMS,
  [Dialect.Postgres]: PG_TLS_PARAMS,
}

export const getSslOptions = (
  { options, type }: Pick<ConnectionParts, 'options' | 'type'>,
  setting: SslSetting
) => {
  const dialect = type && getDialect(type)
  const option = dialect ? SSL_OPTIONS[dialect]?.[setting] : undefined
  if (!dialect || !option) {
    return
  }
  const update = new URLSearchParams(option)
  const dropped = new Set([
    ...update.keys(),
    ...(setting === 'off' ? (TLS_PARAMS[dialect] ?? []) : []),
  ])
  const merged = new URLSearchParams(
    [...new URLSearchParams(options)].filter(
      ([key]) => !dropped.has(key.toLowerCase())
    )
  )
  for (const [key, value] of update) {
    merged.append(key, value)
  }
  return merged.toString()
}
