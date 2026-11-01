import { Buffer } from 'node:buffer'
import {
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import fs from 'node:fs'

import { bridgeKey } from '@tamery/shared/bridge'
import { type } from 'arktype'

import { configFiles } from '../config-files'

const pairingsFile = type({
  browsers: type({
    /** Only the secret's hash is kept, which is also the key the bridge's `hello` proof is made with. */
    hash: 'string',
    id: 'string',
    label: 'string',
  }).array(),
})

type Browser = (typeof pairingsFile.infer)['browsers'][number]

const CODE_TTL_MS = 10 * 60 * 1000
const CODE_LENGTH = 8
/** No 0/O, 1/I/L: the code is also typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const BEARER_PREFIX = 'Bearer '

let browsers: Browser[] = fs.existsSync(configFiles.pairings)
  ? pairingsFile.assert(
      JSON.parse(fs.readFileSync(configFiles.pairings, 'utf-8'))
    ).browsers
  : []

const save = () =>
  configFiles.write(configFiles.pairings, JSON.stringify({ browsers }, null, 2))

let code: { expiresAt: number; value: string } | null = null

const sameText = (left: string, right: string) =>
  left.length === right.length &&
  timingSafeEqual(Buffer.from(left), Buffer.from(right))

/** One pairing code at a time: single use, ten minutes. */
export const pairings = {
  authenticate: (authorization: string | null) => {
    if (!authorization?.startsWith(BEARER_PREFIX)) {
      return null
    }
    const hash = bridgeKey.hash(authorization.slice(BEARER_PREFIX.length))
    return browsers.find((browser) => sameText(browser.hash, hash))?.id ?? null
  },
  count: () => browsers.length,
  getHash: (browserId: string) =>
    browsers.find((browser) => browser.id === browserId)?.hash ?? null,
  /** The dash in `ABCD-EFGH` is only for reading; `isCode` ignores it. */
  issueCode: () => {
    const value = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    ).join('')
    code = { expiresAt: Date.now() + CODE_TTL_MS, value }
    return `${value.slice(0, 4)}-${value.slice(4)}`
  },
  isCode: (attempt: string) =>
    !!code &&
    Date.now() < code.expiresAt &&
    sameText(attempt.toUpperCase().replaceAll('-', ''), code.value),
  /** Spends the code `isCode` accepted. */
  pair: (label: string) => {
    code = null
    const secret = randomBytes(32).toString('base64url')
    const browser = { hash: bridgeKey.hash(secret), id: randomUUID(), label }
    browsers = [...browsers, browser]
    save()
    return { browserId: browser.id, secret }
  },
  remove: (browserId: string) => {
    browsers = browsers.filter((browser) => browser.id !== browserId)
    save()
  },
  reset: () => {
    browsers = []
    code = null
    configFiles.remove(configFiles.pairings)
  },
}
