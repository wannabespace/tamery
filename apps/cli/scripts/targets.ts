/** `<os>-<cpu>[-musl]`, the name `install.sh`, `install.ps1` and the npm launcher (`npm/tamery.js`) rebuild on their own. */
export const TARGETS = {
  'darwin-arm64': 'bun-darwin-arm64',
  'darwin-x64': 'bun-darwin-x64',
  'linux-arm64': 'bun-linux-arm64',
  'linux-arm64-musl': 'bun-linux-arm64-musl',
  'linux-x64': 'bun-linux-x64-baseline',
  'linux-x64-musl': 'bun-linux-x64-musl',
  'windows-x64': 'bun-windows-x64-baseline',
} as const satisfies Record<string, Bun.Build.CompileTarget>

export type Target = keyof typeof TARGETS

export const isTarget = (name: string): name is Target => name in TARGETS

export const getBinaryName = (target: Target) =>
  target.startsWith('windows') ? 'tamery.exe' : 'tamery'
