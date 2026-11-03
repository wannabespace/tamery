import { expect, test } from 'bun:test'

import { detectInstaller } from './installer'

const unix = (prefix: string) =>
  `${prefix}/node_modules/@tamery/cli-darwin-arm64/bin/tamery`
const windows = (prefix: string) =>
  `${prefix}\\node_modules\\@tamery\\cli-windows-x64\\bin\\tamery.exe`

test.each([
  ['/Users/me/.tamery/bin/tamery', 'darwin', 'shell'],
  ['/usr/local/bin/tamery', 'linux', 'shell'],
  [String.raw`C:\Users\me\.tamery\bin\tamery.exe`, 'win32', 'powershell'],
  [unix('/opt/homebrew/lib/node_modules/tamery'), 'darwin', 'npm'],
  [unix('/home/pnpm-user/.npm-global/lib/node_modules/tamery'), 'linux', 'npm'],
  [
    windows(String.raw`C:\Users\yarn\AppData\Roaming\npm\node_modules\tamery`),
    'win32',
    'npm',
  ],
  [
    unix(
      '/Users/me/Library/pnpm/global/5/node_modules/.pnpm/@tamery+cli-darwin-arm64@1.0.0'
    ),
    'darwin',
    'pnpm',
  ],
  [
    unix(
      '/Users/me/Library/pnpm/store/v10/links/@tamery/cli-darwin-arm64/1.0.0/abc'
    ),
    'darwin',
    'pnpm',
  ],
  [
    windows(
      String.raw`C:\Users\me\AppData\Local\pnpm\global\5\node_modules\.pnpm\x`
    ),
    'win32',
    'pnpm',
  ],
  [unix('/Users/me/.bun/install/global'), 'darwin', 'bun'],
  [unix('/opt/tools/install/global'), 'linux', 'bun'],
  [unix('/Users/me/.config/yarn/global'), 'darwin', 'yarn'],
  [
    windows(String.raw`C:\Users\me\AppData\Local\Yarn\Data\global`),
    'win32',
    'yarn',
  ],
] as const)('%s on %s is %s', (execPath, platform, installer) => {
  expect(detectInstaller(execPath, platform)).toBe(installer)
})
