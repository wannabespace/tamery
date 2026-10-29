import type { PostHog } from 'posthog-js'

let instance: Promise<PostHog> | null = null
let identity: Parameters<PostHog['identify']> | null = null

const UUID = /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/giu
// A tab id carries schema and table names after its kind (`table:public:users`).
const TAB_ID_NAMES = /\/(?<kind>[a-z-]+):[^/]*/giu
const EXPECTED_ERROR = /ResizeObserver loop|failed to fetch|network ?error/iu
// Sync with the CSP `script-src` in `apps/app/index.html`, or the SDK's lazy-loaded scripts are blocked.
const API_HOST = 'https://e.tamery.app'

export const getAppProperties = () => ({
  app_version: import.meta.env.VITE_APP_VERSION,
  channel: import.meta.env.DEV ? 'development' : 'production',
  platform: window.electron ? 'desktop' : 'web',
})

const init = async () => {
  const [{ default: posthogJs }, { isConnectionFailure }, { history }] =
    await Promise.all([
      import('posthog-js'),
      import('@tamery/connection/diagnose'),
      import('./last-location'),
    ])

  const getAppPath = () =>
    history.location.pathname
      .replaceAll(UUID, ':id')
      .replaceAll(TAB_ID_NAMES, '/$<kind>')

  // The window URL is a local file path in Electron, so replay URL triggers and events match this logical URL instead.
  const getAppUrl = () =>
    `${window.electron ? 'tamery://app' : location.origin}${getAppPath()}`

  const client = posthogJs.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: API_HOST,
    before_send: (event) => {
      const isExpectedException =
        event?.event === '$exception' &&
        event.properties.$exception_list.some(
          ({ value }: { value: string }) =>
            EXPECTED_ERROR.test(value) || isConnectionFailure(value)
        )
      if (!event || isExpectedException) {
        return null
      }
      event.properties.$current_url = getAppUrl()
      event.properties.$pathname = getAppPath()
      return event
    },
    capture_dead_clicks: true,
    capture_pageview: false,
    // Later defaults stream network bodies into replays, and API responses carry decrypted connection strings.
    defaults: '2026-01-30',
    disable_session_recording: false,
    // Overrides the project's console log toggle: database errors echo query text and row values.
    enable_recording_console_log: false,
    get_current_url: getAppUrl,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-mask]',
    },
    ui_host: 'https://eu.posthog.com',
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
