import process from 'node:process'

import type { BRIDGE_INSTALL_COMMANDS } from '@tamery/shared/bridge'

/**
 * The npm launcher runs the binary from inside its own package; the install scripts put it anywhere else. Matched by
 * folder, never substring: a user or prefix named after a package manager must not pass for its global folder.
 */
export const detectInstaller = (
  execPath: string,
  platform: NodeJS.Platform
): keyof typeof BRIDGE_INSTALL_COMMANDS => {
  const path = execPath.toLowerCase().replaceAll('\\', '/')
  if (!path.includes('/node_modules/')) {
    return platform === 'win32' ? 'powershell' : 'shell'
  }
  if (/\/\.?pnpm\//u.test(path)) {
    return 'pnpm'
  }
  if (path.includes('/install/global/node_modules/')) {
    return 'bun'
  }
  return /\/yarn\/(?:data\/)?global\//u.test(path) ? 'yarn' : 'npm'
}

export const installer = detectInstaller(process.execPath, process.platform)
