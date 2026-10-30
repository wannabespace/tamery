export { PORTS } from './ports'

export const SOCIAL_LINKS = {
  DISCORD: 'https://discord.gg/XweDPUVadR',
  GITHUB: 'https://github.com/wannabespace/tamery',
  TWITTER: 'https://x.com/tamery_app',
} as const

export const SOCIAL_PROVIDER_LABELS = {
  github: 'GitHub',
  google: 'Google',
} as const

export const RELEASES_URL = 'https://tamery.app/releases' as const

export const DOCS_URL = 'https://docs.tamery.app' as const

export const MIN_WINDOW_WIDTH = 600
export const MIN_WINDOW_HEIGHT = 300

export const GITHUB_REPO_OWNER = 'wannabespace' as const
export const GITHUB_REPO_NAME = 'tamery' as const

export const CONTACT_EMAIL = 'hello@tamery.app'

export const BREW_INSTALL_COMMAND = 'brew install --cask tamery'

export const AUTH_COOKIE_PREFIX = 'tamery' as const

export const LABEL_OPTIONS = ['Local', 'Test', 'Dev', 'Staging', 'Prod']

export const COLOR_OPTIONS = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Pink', value: '#db2777' },
]

export const SUBSCRIPTION_PAST_DUE_MESSAGE =
  "We couldn't process your recent payment. Please update your payment method to avoid any interruption to your subscription." as const
export const ACTIVE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
] as const

export const GUEST_CONNECTIONS_MESSAGE = 'Guests can save one connection.'

export const SHARE_ACCOUNT_MESSAGE = 'Sharing tables needs an account.'

export const SESSION_NOT_FOUND_MESSAGE =
  'We could not find your session. Please sign in again.'

export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please, sign in again.'

export const UNKNOWN_ERROR_MESSAGE =
  'Our server is practicing its meditation. Please, try again later.'

export const SUPPORT_SENT_MESSAGE =
  'Support message sent successfully! We will get back to you as soon as possible.'

export const SUPPORT_FAILED_MESSAGE =
  'Failed to send message. Please try again later.'

export const CONNECTION_RESOURCE_ROOT_SYMBOL = Symbol(
  'CONNECTION_RESOURCE_ROOT'
)

export const PROXY_ERROR_MESSAGE =
  "We can't connect to the proxy, please check your connection and try again."

export const RECONNECT_ERROR_PATTERNS = [
  'econnreset',
  'etimedout',
  'epipe',
  'econnrefused',
  'enotfound',
  'connection lost',
  'socket hang up',
  'socketerror',
  'network',
  'application failed to respond',
  'failed to fetch',
  'connection terminated unexpectedly',
  'connection terminated due to connection timeout',
  'failed to connect',
  'the database system is not yet accepting connections',
  'the database system is starting up',
]

export const EARLY_ACCESS_ERROR_CODE = 'EARLY_ACCESS_PENDING'
