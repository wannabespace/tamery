import process from 'node:process'

import { drainBackground } from '@tamery/shared/background'
import { sleep } from '@tamery/shared/utils'

import { posthog } from './posthog'
import { redis } from './redis'

// Must stay under Cloud Run's fixed 10 seconds between SIGTERM and its kill.
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
