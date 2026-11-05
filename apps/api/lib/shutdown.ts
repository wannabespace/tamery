import process from 'node:process'

import { drainBackground } from '@tamery/shared/background'
import { sleep } from '@tamery/shared/utils'

import { posthog } from './posthog'
import { redis } from './redis'

// Must stay under the host's wait between SIGTERM and its kill (RAILWAY_DEPLOYMENT_DRAINING_SECONDS).
const DRAIN_LIMIT_MS = 8000

const drain = async () => {
  await drainBackground()
  // close() sends the publishes that handlers fired without awaiting.
  await Promise.allSettled([redis.close(), posthog?.shutdown()])
}

export const shutdown = async () => {
  await Promise.race([drain(), sleep(DRAIN_LIMIT_MS)])
  process.exit(0)
}
