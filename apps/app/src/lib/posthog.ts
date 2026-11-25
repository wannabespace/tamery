import { POSTHOG_API_HOST, POSTHOG_UI_HOST } from '@tamery/shared/posthog'
import { type } from 'arktype'
import type { PostHog } from 'posthog-js'

let instance: Promise<PostHog> | null = null
let identity: Parameters<PostHog['identify']> | null = null

const uuid = type('string.uuid')
const EXPECTED_ERRORS = [
  'resizeobserver loop',
  'failed to fetch',
  'network error',
  'networkerror',
]

const normalizeSegment = (segment: string) => {
  // A tab id carries schema and table names after its kind (`table:public:users`).
  const [kind = segment] = segment.split(':')
  return uuid.allows(segment) ? ':id' : kind
}

const isExpectedError = (message: string) => {
  const lower = message.toLowerCase()
  return EXPECTED_ERRORS.some((error) => lower.includes(error))
}

export const getAppProperties = () => ({
  app_version: import.meta.env.VITE_APP_VERSION,
  channel: import.meta.env.DEV ? 'development' : 'production',
  platform: window.electron ? 'desktop' : 'web',
})

const init = async () => {
  const [
    { default: posthogJs },
    { isConnectionFailure },
    { sanitizeLogData },
    { history },
  ] = await Promise.all([
    import('posthog-js'),
    import('@tamery/connection/diagnose'),
    import('@tamery/shared/sanitize-log'),
    import('./last-location'),
  ])

  const getAppPath = () =>
    history.location.pathname.split('/').map(normalizeSegment).join('/')

  // The window URL is a local file path in Electron, so replay URL triggers and events match this logical URL instead.
  const getAppUrl = () =>
    `${window.electron ? 'tamery://app' : location.origin}${getAppPath()}`

  const client = posthogJs.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: POSTHOG_API_HOST,
    before_send: (event) => {
      const isExpectedException =
        event?.event === '$exception' &&
        event.properties.$exception_list.some(
          ({ value }: { value: string }) =>
            isExpectedError(value) || isConnectionFailure(value)
        )
      if (!event || isExpectedException) {
        return null
      }
      if (event.event === '$exception') {
        event.properties.$exception_list = sanitizeLogData(
          event.properties.$exception_list
        )
      }
      event.properties.$current_url = getAppUrl()
      event.properties.$pathname = getAppPath()
      return event
    },
    capture_dead_clicks: true,
    capture_pageview: false,
    defaults: '2026-01-30',
    disable_session_recording: false,
    // Overrides the project's console log toggle: database errors echo query text and row values.
    enable_recording_console_log: false,
    get_current_url: getAppUrl,
    // Autocapture's `$el_text` would carry connection, table and column names.
    mask_all_text: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-mask]',
      // Pinned off: the project's own network-capture setting would otherwise record bodies, and `connections.resolve`
      // answers with decrypted connection strings.
      recordBody: false,
      recordHeaders: false,
    },
    ui_host: POSTHOG_UI_HOST,
  })
  client.register({ app: 'app', ...getAppProperties() })
  // PostHog stores an opt-out on its own. Without this, the removed Settings switch stays in effect.
  client.opt_in_capturing({ captureEventName: false })
  if (identity) {
    client.identify(...identity)
  }
  client.capture('app_opened', {
    app_version: import.meta.env.VITE_APP_VERSION,
  })
  return client
}

const withClient = async (run: (client: PostHog) => void) => {
  if (import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) {
    run(await (instance ??= init()))
  }
}

export const posthog = {
  capture: (...args: Parameters<PostHog['capture']>) =>
    withClient((client) => client.capture(...args)),
  captureException: (...args: Parameters<PostHog['captureException']>) =>
    withClient((client) => client.captureException(...args)),
  identify: (...args: Parameters<PostHog['identify']>) => {
    identity = args
    return withClient((client) => client.identify(...args))
  },
  reset: (...args: Parameters<PostHog['reset']>) => {
    identity = null
    return withClient((client) => client.reset(...args))
  },
}
