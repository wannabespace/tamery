import process from 'node:process'

import { log } from '@clack/prompts'
import type { BRIDGE_INSTALL_COMMANDS } from '@tamery/shared/bridge'
import { type } from 'arktype'
import { Result } from 'better-result'

import { env } from './env'
import { paint } from './paint'

const REGISTRY_TIMEOUT_MS = 3000

/**
 * The npm launcher runs the binary from inside its own package; the install scripts put it anywhere else. Each package
 * manager keeps global packages under a folder naming it, and npm under none.
 */
const getInstaller = (): keyof typeof BRIDGE_INSTALL_COMMANDS => {
  const path = process.execPath.toLowerCase()
  if (!path.includes('node_modules')) {
    return process.platform === 'win32' ? 'powershell' : 'shell'
  }
  if (path.includes('pnpm')) {
    return 'pnpm'
  }
  if (path.includes('.bun')) {
    return 'bun'
  }
  return path.includes('yarn') ? 'yarn' : 'npm'
}

const installer = getInstaller()

let latestVersion: string | null = null

const fetchLatest = () =>
  Result.tryPromise(async () => {
    const response = await fetch('https://registry.npmjs.org/tamery/latest', {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    })
    return type({ version: 'string' }).assert(await response.json()).version
  })

const isNewer = (version: string) =>
  Bun.semver.order(version, env.VERSION) === 1

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
  installer,
  isNewer,
  latest: () => latestVersion,
}
