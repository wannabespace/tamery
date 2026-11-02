import { Buffer } from 'node:buffer'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'

import { bridgeKey } from '@tamery/shared/bridge'
import { type } from 'arktype'

import { configFiles } from '../config-files'

const browserFile = type('string.json.parse').to({
  hash: 'string',
  label: 'string',
})

const BEARER_PREFIX = 'Bearer '

const getFile = (browserId: string) =>
  path.join(configFiles.browsers, `${browserId}.json`)

/** Read on every call, so `tamery bridge unpair-all` and `tamery logout` reach a bridge already running. */
const readBrowsers = () =>
  configFiles
    .readAll(configFiles.browsers)
    .map(({ data, id }) => ({ id, ...browserFile.assert(data) }))

export const pairings = {
  /** Only after someone allowed it (`approvals`). */
  add: (label: string) => {
    const secret = randomBytes(32).toString('base64url')
    const browserId = randomUUID()
    configFiles.write(
      getFile(browserId),
      JSON.stringify({ hash: bridgeKey.hash(secret), label })
    )
    return { browserId, secret }
  },
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
  find: (browserId: string) =>
    readBrowsers().find((browser) => browser.id === browserId) ?? null,
  labels: () => readBrowsers().map((browser) => browser.label),
  remove: (browserId: string) => configFiles.remove(getFile(browserId)),
  reset: () => configFiles.remove(configFiles.browsers),
}
