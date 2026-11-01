import process from 'node:process'

import { log } from '@clack/prompts'
import { type } from 'arktype'
import { Result } from 'better-result'

import { env } from './env'

const REGISTRY_TIMEOUT_MS = 3000

/** The npm launcher runs the binary from inside its own package; the install scripts put it anywhere else. */
const getUpdateCommand = () => {
  if (process.execPath.includes('node_modules')) {
    return 'npm i -g tamery'
  }
  if (process.platform === 'win32') {
    return 'irm https://tamery.app/cli/install.ps1 | iex'
  }
  return 'curl -fsSL https://tamery.app/cli/install.sh | sh'
}

let latestVersion: string | null = null

export const updates = {
  /** Never awaited at startup: the registry must not hold the bridge back. */
  check: async () => {
    const fetched = await Result.tryPromise(async () => {
      const response = await fetch('https://registry.npmjs.org/tamery/latest', {
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      })
      return type({ version: 'string' }).assert(await response.json()).version
    })
    if (fetched.isOk() && Bun.semver.order(fetched.value, env.VERSION) === 1) {
      latestVersion = fetched.value
      log.warn(`Update available: ${latestVersion}. Run: ${updates.command}`)
    }
  },
  command: getUpdateCommand(),
  latest: () => latestVersion,
}
