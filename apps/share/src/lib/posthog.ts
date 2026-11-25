import type { PostHog } from 'posthog-js'

let instance: Promise<PostHog> | null = null

const SHARE_ID = /[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/giu

/** A share's URL is enough to read it when it has no password, so no event property carries its id. */
const removeShareIds = (properties: Record<string, unknown> = {}) => {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') {
      properties[key] = value.replaceAll(SHARE_ID, ':id')
    }
  }
}

const init = async () => {
  const { default: posthogJs } = await import('posthog-js')

  // Memory persistence and no recording keep the site cookieless, like the website: viewers have no account and agreed to nothing.
  const client = posthogJs.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: 'https://eu.i.posthog.com',
    autocapture: false,
    before_send: (event) => {
      if (event) {
        removeShareIds(event.properties)
        removeShareIds(event.$set)
        removeShareIds(event.$set_once)
      }
      return event
    },
    defaults: '2026-01-30',
    disable_session_recording: true,
    persistence: 'memory',
  })
  client.register({ app: 'share' })
  return client
}

const load = () =>
  typeof window !== 'undefined' && import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN
    ? (instance ??= init())
    : null

export const posthog = {
  capture: async (...args: Parameters<PostHog['capture']>) => {
    const client = await load()
    client?.capture(...args)
  },
  start: load,
}
