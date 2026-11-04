import { SafeURL } from '@tamery/shared/safe-url'
import { lowercaseKeys } from '@tamery/shared/utils'

import { SSH_PARAMS } from './ssh/params'

const SSH_SECRET_PARAMS = [
  SSH_PARAMS.password,
  SSH_PARAMS.privateKey,
  SSH_PARAMS.passphrase,
] as const

/**
 * Sync with the secret params `ssl/*.ts` and `ssh/` read, and the ones ClickHouse (`http_header_*`) and MongoDB take
 * straight from the string. `sslkey` stays out: the drivers read it as a file path.
 */
const SECRET_PARAMS = [
  ...SSH_SECRET_PARAMS,
  'access_token',
  'authmechanismproperties',
  'http_header_authorization',
  'sslpassword',
  'sslpassphrase',
  'sslpfx',
  'tlscertificatekeyfilepassword',
] as const

export type SecretParam = (typeof SECRET_PARAMS)[number]

const getUrl = (connectionString: string) => {
  const url = new SafeURL(connectionString)
  url.search = lowercaseKeys(url.searchParams).toString()
  return url
}

/** `strip` empties a secret rather than dropping it, so another device knows which ones to ask for. */
export const connectionSecrets = {
  /** Equal but for the database and secrets: the same host, port, user, proxy, TLS and every other option. */
  isSameServer: (a: string, b: string) => {
    const [first, second] = [a, b].map((value) => {
      const stripped = getUrl(connectionSecrets.strip(value))
      stripped.pathname = ''
      stripped.searchParams.sort()
      return stripped.toString()
    })
    return first === second
  },
  /** Keeps the database password and the SSL key passphrase: a copied string must still connect from another client. */
  copyable: (connectionString: string) => {
    const url = getUrl(connectionString)
    for (const param of SSH_SECRET_PARAMS) {
      url.searchParams.delete(param)
    }
    return url.toString()
  },
  missing: (searchParams: URLSearchParams): SecretParam[] => {
    const params = lowercaseKeys(searchParams)
    return SECRET_PARAMS.filter((param) => params.get(param) === '')
  },
  /**
   * `isPasswordExists` is the synced connection's flag: an empty synced password is only a stripped one while it is set,
   * otherwise another device removed it. Secrets restore only while nothing but the database changed: anyone who can edit
   * a shared connection could otherwise point it at their own host (or route it through a MongoDB `proxyHost`, or turn
   * TLS off) and have this device send them there.
   */
  restore: (
    connectionString: string,
    { isPasswordExists, local }: { isPasswordExists: boolean; local: string }
  ) => {
    const url = getUrl(connectionString)
    if (!connectionSecrets.isSameServer(connectionString, local)) {
      return url.toString()
    }
    const localUrl = getUrl(local)
    if (isPasswordExists) {
      url.password ||= localUrl.password
    }
    for (const param of connectionSecrets.missing(url.searchParams)) {
      const value = localUrl.searchParams.get(param)
      if (value) {
        url.searchParams.set(param, value)
      }
    }
    return url.toString()
  },
  stored: (connectionString: string) => {
    const url = getUrl(connectionString)
    return (
      !!url.password ||
      SECRET_PARAMS.some((param) => url.searchParams.get(param))
    )
  },
  strip: (connectionString: string) => {
    const url = getUrl(connectionString)
    url.password = ''
    url.hash = ''
    for (const param of SECRET_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '')
      }
    }
    return url.toString()
  },
}
