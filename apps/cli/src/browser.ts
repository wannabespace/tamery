import process from 'node:process'

import { Result } from 'better-result'

/** `cmd /c start` would split a URL at its `&`; the URL handler takes it whole. */
const OPENERS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['open'],
  win32: ['rundll32', 'url.dll,FileProtocolHandler'],
}

/** `false` when no browser could be started, so the caller prints the URL to open by hand. */
export const openBrowser = (url: string) =>
  Result.try(() =>
    Bun.spawn([...(OPENERS[process.platform] ?? ['xdg-open']), url], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
  ).isOk()
