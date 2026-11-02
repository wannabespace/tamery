import process from 'node:process'

import { log } from '@clack/prompts'
import { BRIDGE_INSTALL_COMMANDS } from '@tamery/shared/bridge'
import { type } from 'arktype'
import { Result } from 'better-result'

import { env } from './env'
import { paint } from './paint'

const REGISTRY_TIMEOUT_MS = 3000

/** The npm launcher runs the binary from inside its own package; the install scripts put it anywhere else. */
const getInstaller = (): keyof typeof BRIDGE_INSTALL_COMMANDS => {
  if (process.execPath.includes('node_modules')) {
    return 'npm'
  }
  return process.platform === 'win32' ? 'powershell' : 'shell'
}

const installer = getInstaller()

let latestVersion: string | null = null

export const updates = {
  /** Never awaited at startup: the registry must not hold the bridge back. */
  check: async () => {
    if (!import.meta.env.VERSION) {
      return
    }
    const fetched = await Result.tryPromise(async () => {
      const response = await fetch('https://registry.npmjs.org/tamery/latest', {
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      })
      return type({ version: 'string' }).assert(await response.json()).version
    })
    if (fetched.isOk() && Bun.semver.order(fetched.value, env.VERSION) === 1) {
      latestVersion = fetched.value
      log.warn(
        `Update available: ${latestVersion}\n${paint.dim('Run')} ${BRIDGE_INSTALL_COMMANDS[installer]}`
      )
    }
  },
  installer,
  latest: () => latestVersion,
}
