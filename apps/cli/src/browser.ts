import process from 'node:process'

import { silently } from '@tamery/shared/utils'

/** `cmd /c start` would split a URL at its `&`; the URL handler takes it whole. */
const OPENERS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['open'],
  win32: ['rundll32', 'url.dll,FileProtocolHandler'],
}

export const openBrowser = (url: string) =>
  silently(() =>
    Bun.spawn([...(OPENERS[process.platform] ?? ['xdg-open']), url], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
  )
