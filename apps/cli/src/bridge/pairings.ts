import { Buffer } from 'node:buffer'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'

import { bridgeKey } from '@tamery/shared/bridge'
import { type } from 'arktype'

import { configFiles } from '../config-files'

const pairingsFile = type({
  browsers: type({
    hash: 'string',
    id: 'string',
    label: 'string',
  }).array(),
})

type Browser = (typeof pairingsFile.infer)['browsers'][number]

const BEARER_PREFIX = 'Bearer '

/** Read on every call, so `tamery bridge unpair-all` and `tamery logout` reach a bridge already running. */
const readBrowsers = (): Browser[] =>
  fs.existsSync(configFiles.pairings)
    ? pairingsFile.assert(
        JSON.parse(fs.readFileSync(configFiles.pairings, 'utf-8'))
      ).browsers
    : []

const save = (browsers: Browser[]) =>
  configFiles.write(configFiles.pairings, JSON.stringify({ browsers }, null, 2))

export const pairings = {
  authenticate: (authorization: string | null) => {
    if (!authorization?.startsWith(BEARER_PREFIX)) {
      return null
    }
    const hash = bridgeKey.hash(authorization.slice(BEARER_PREFIX.length))
    return (
      readBrowsers().find(
        (browser) =>
          browser.hash.length === hash.length &&
          timingSafeEqual(Buffer.from(browser.hash), Buffer.from(hash))
      )?.id ?? null
    )
  },
  count: () => readBrowsers().length,
  getHash: (browserId: string) =>
    readBrowsers().find((browser) => browser.id === browserId)?.hash ?? null,
  getLabel: (browserId: string) =>
    readBrowsers().find((browser) => browser.id === browserId)?.label ?? null,
  /** Only after someone allowed it (`approvals`). */
  add: (label: string) => {
    const secret = randomBytes(32).toString('base64url')
    const browser = { hash: bridgeKey.hash(secret), id: randomUUID(), label }
    save([...readBrowsers(), browser])
    return { browserId: browser.id, secret }
  },
  remove: (browserId: string) => {
    save(readBrowsers().filter((browser) => browser.id !== browserId))
  },
  reset: () => configFiles.remove(configFiles.pairings),
}
