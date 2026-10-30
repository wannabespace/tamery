import { deepRedact } from '@hackylabs/deep-redact'

/** Up to the userinfo's last `@`: a password may hold a raw `@`, a host never does. */
const URL_PASSWORD = /(?<user>\/\/[^\s/:@]*:)\S*?@(?=[^\s/?#@]*(?:[\s/?#]|$))/gu
const KEY_VALUE_SECRET =
  /(?<key>(?:password|passphrase|pwd|token|authorization|ssh_key|sslpfx|authmechanismproperties)\s*=\s*)[^\s;&'"]+/giu
const SECRET_TEXT = new RegExp(
  `${URL_PASSWORD.source}|${KEY_VALUE_SECRET.source}`,
  'iu'
)

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
  // Strings that embed a connection string (chat text, SQL, driver errors) carry no key to match. One test runs every
  // pattern: deep-redact applies only the first test that matches a string.
  stringTests: [
    {
      pattern: SECRET_TEXT,
      replacer: (value) =>
        value
          .replaceAll(URL_PASSWORD, '$<user>[REDACTED]@')
          .replaceAll(KEY_VALUE_SECRET, '$<key>[REDACTED]'),
    },
  ],
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
