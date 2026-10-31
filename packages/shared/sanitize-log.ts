import { deepRedact } from '@hackylabs/deep-redact'

import { decodeURIComponentOrRaw } from './utils'

/** Up to the userinfo's last `@`: a password may hold a raw `@`, a host never does. */
const URL_PASSWORD = /(?<user>\/\/[^\s/:@]*:)\S*?@(?=[^\s/?#@]*(?:[\s/?#]|$))/gu
const SECRET_NAME =
  /password|passphrase|pwd|token|authorization|ssh_key|sslpfx|authmechanismproperties/iu
/** A query value runs to the next `&` or `#`: a `;` or a quote is part of it. */
const QUERY_PARAM = /(?<key>[?&](?<name>[^\s&#=]+)=)[^\s&#]*/gu
const AUTHORIZATION =
  /(?<key>authorization\s*[:=]\s*(?:(?:basic|bearer|digest|negotiate)\s+)?)[^\s;&'"]+/giu
/** `Server=h;Password=p` and the like, outside a URL. */
const KEY_VALUE = /(?<key>(?<name>[\w%-]+)\s*=\s*)[^\s;&'"]+/gu
const MAY_HOLD_SECRET = /[:=]/u

/** The name is decoded first: a driver reads `%73sh_key` as `ssh_key`. */
const redactWhenSecret = (match: string, key: string, name: string) =>
  SECRET_NAME.test(decodeURIComponentOrRaw(name)) ? `${key}[REDACTED]` : match

export const redactSecrets = (text: string) =>
  text
    .replaceAll(URL_PASSWORD, '$<user>[REDACTED]@')
    .replaceAll(QUERY_PARAM, redactWhenSecret)
    // Before `KEY_VALUE`, which would stop at the space in `Basic abc` and leave `abc`.
    .replaceAll(AUTHORIZATION, '$<key>[REDACTED]')
    .replaceAll(KEY_VALUE, redactWhenSecret)

const redactor = deepRedact({
  caseSensitiveKeyMatch: false,
  fuzzyKeyMatch: true,
  keys: [
    /password/iu,
    /passwd/iu,
    /secret/iu,
    /token/iu,
    /api[-_]?key/iu,
    /authorization/iu,
    /cookie/iu,
    /session/iu,
    /credit[-_]?card/iu,
    /card[-_]?number/iu,
    /cvv/iu,
    /cvc/iu,
    /credentials?/iu,
    /connectionString?/iu,
    /invalidData/iu,
  ],
  serialise: false,
  // One test runs every pattern: deep-redact applies only the first test that matches a string.
  stringTests: [{ pattern: MAY_HOLD_SECRET, replacer: redactSecrets }],
  transformers: {
    byConstructor: {
      // Unconverted, an Error is logged as-is: a validation error's `invalidData` holds the whole raw input.
      Error: [
        (error) => {
          const { cause, message, name, stack } = error as Error
          return { ...(error as Error), cause, message, name, stack }
        },
      ],
    },
  },
})

export const sanitizeLogData = <T>(data: T): T => redactor(data) as T

/** Logs the message alone: a driver's `error` event also hands over its client, whose fields hold the password. */
export const logDriverError = (error: Error) => {
  console.error(sanitizeLogData({ error: error.message }))
}
