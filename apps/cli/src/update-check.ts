import { log } from '@clack/prompts'
import { type } from 'arktype'
import { Result } from 'better-result'

import { env } from './env'
import { paint } from './paint'

const STARTUP_TIMEOUT_MS = 3000

/** The version lands in a shell command, so anything but a version is refused. */
const distTags = type({ latest: 'string.semver', 'next?': 'string.semver' })

let latestVersion: string | null = null

const isNewer = (version: string) =>
  Bun.semver.order(version, env.VERSION) === 1

/** A release candidate follows `next` too, so it is offered the next candidate and then the release. */
const fetchLatest = (timeoutMs = STARTUP_TIMEOUT_MS) =>
  Result.tryPromise(async () => {
    const response = await fetch(
      'https://registry.npmjs.org/-/package/tamery/dist-tags',
      { signal: AbortSignal.timeout(timeoutMs) }
    )
    if (!response.ok) {
      throw new Error(`The npm registry answered ${response.status}.`)
    }
    const tags = distTags.assert(await response.json())
    return tags.next &&
      env.VERSION.includes('-') &&
      Bun.semver.order(tags.next, tags.latest) === 1
      ? tags.next
      : tags.latest
  })

export const updates = {
  /** Never awaited at startup: the registry must not hold the bridge back. */
  check: async () => {
    const fetched = await fetchLatest()
    if (fetched.isOk() && isNewer(fetched.value)) {
      latestVersion = fetched.value
      log.warn(
        `Update available: ${latestVersion}\n${paint.dim('Run')} ${paint.accent('tamery update')}`
      )
    }
  },
  fetchLatest,
  isNewer,
  latest: () => latestVersion,
}
