import { POSTHOG_API_HOST, POSTHOG_UI_HOST } from '@tamery/shared/posthog'
import { type } from 'arktype'
import type { PostHog } from 'posthog-js'
import { createWebStorageValue } from 'seitu/web'

export const ANALYTICS_STORAGE_KEY = 'analytics-enabled'

export const analyticsStore = createWebStorageValue({
  defaultValue: true,
  key: ANALYTICS_STORAGE_KEY,
  schema: type('boolean'),
  type: 'localStorage',
})

let instance: Promise<PostHog> | null = null
let identity: Parameters<PostHog['identify']> | null = null

const uuid = type('string.uuid')

const normalizeSegment = (segment: string) => {
  // A tab id carries schema and table names after its kind (`table:public:users`).
  const [kind = segment] = segment.split(':')
  return uuid.allows(segment) ? ':id' : kind
}

export const getAppProperties = () => ({
  app_version: import.meta.env.VITE_APP_VERSION,
  channel: import.meta.env.DEV ? 'development' : 'production',
  platform: window.electron ? 'desktop' : 'web',
})

const applyAnalyticsChoice = (client: PostHog) => {
  if (analyticsStore.get()) {
    client.opt_in_capturing({ captureEventName: false })
  } else {
    client.opt_out_capturing()
  }
}

const init = async () => {
  const [
    { default: posthogJs },
    { isExpectedException },
    { sanitizeLogData },
    { history },
  ] = await Promise.all([
    import('posthog-js'),
    import('./expected-exception'),
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
      const exceptions: { value: string }[] =
        event?.event === '$exception' ? event.properties.$exception_list : []
      if (
        !event ||
        isExpectedException(
          exceptions.map(({ value }) => value),
          navigator.onLine
        )
      ) {
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
  // Applied once here too: PostHog persists an opt-out across reloads, and the choice may have changed during the import.
  applyAnalyticsChoice(client)
  analyticsStore.subscribe(() => applyAnalyticsChoice(client))
  if (identity) {
    client.identify(...identity)
  }
  client.capture('app_opened', {
    app_version: import.meta.env.VITE_APP_VERSION,
  })
  return client
}

// A loaded client keeps receiving identify/reset while opted out, or the next opt-in sends events under the previous user's id.
const withClient = async (run: (client: PostHog) => void) => {
  if (
    import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN &&
    (analyticsStore.get() || instance)
  ) {
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
    return withClient((client) => {
      client.reset(...args)
      // `reset` also clears PostHog's stored opt-out, which would turn capturing back on at sign-out.
      applyAnalyticsChoice(client)
    })
  },
}
