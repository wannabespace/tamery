import { isMac } from '@tamery/ui/lib/os'
import { THEME_STORAGE_KEY } from '@tamery/ui/theme-constants'

import {
  CHAT_DRAFTS_KEY,
  CHAT_NEW_IDS_KEY,
  LAST_LOCATION_KEY,
  SHELL_LAYOUT_KEY,
  TRANSPARENT_BACKGROUND_KEY,
} from './lib/constants'

const read = <T>(key: string): T | undefined => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

const isElectron = !!window.electron
const lastLocation = read<string>(LAST_LOCATION_KEY)
const isConnection = /\/connection\/[^/?#]+/u.test(lastLocation ?? '')
const isSettings = /\/settings(?:[/?#]|$)/u.test(lastLocation ?? '')
const layout = isConnection
  ? (read<Record<string, number>>(SHELL_LAYOUT_KEY) ?? {})
  : {}
const theme = read<string>(THEME_STORAGE_KEY) ?? 'system'
const unsentChatResourceId =
  /\/connection\/(?<resourceId>[^/?#]+)\/chat(?:[?#]|$)/u.exec(
    lastLocation ?? ''
  )?.groups?.resourceId
const unsentChatId =
  unsentChatResourceId &&
  read<Record<string, string>>(CHAT_NEW_IDS_KEY)?.[unsentChatResourceId]

const classes = {
  dark:
    theme === 'dark' ||
    (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches),
  electron: isElectron,
  mac: isElectron && isMac,
  opaque: read<boolean>(TRANSPARENT_BACKGROUND_KEY) === false,
  'shell-auth': lastLocation === undefined,
  // A draft would show only once the chat loads, and what was typed into the shell would replace it.
  'shell-chat':
    !!unsentChatResourceId &&
    !(
      unsentChatId &&
      read<Record<string, unknown>>(CHAT_DRAFTS_KEY)?.[unsentChatId]
    ),
  'shell-connection': isConnection,
  'shell-dashboard': lastLocation !== undefined && !isConnection && !isSettings,
  'shell-settings': isSettings,
  ...Object.fromEntries(
    Object.keys(layout).map((region) => [`shell-${region}`, true])
  ),
}

document.documentElement.classList.add(
  ...Object.entries(classes)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
)

for (const [region, size] of Object.entries(layout)) {
  document.documentElement.style.setProperty(
    `--shell-${region}-size`,
    `${size}px`
  )
}
