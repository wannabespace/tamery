import type { PostHog } from 'posthog-js'

let instance: Promise<PostHog> | null = null

/** Only an id in a path: the event's own session and device ids are uuids too. */
const SHARE_ID_IN_PATH =
  /(?<=\/|%2F)[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/giu

/** A share's URL is enough to read it when it has no password, so no URL in an event keeps its id. */
const withoutShareIds = <T>(value: T): T =>
  value === undefined
    ? value
    : JSON.parse(JSON.stringify(value).replaceAll(SHARE_ID_IN_PATH, ':id'))

const init = async () => {
  const { default: posthogJs } = await import('posthog-js')

  // Memory persistence and no recording keep the site cookieless, like the website: viewers have no account and agreed to nothing.
  const client = posthogJs.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: 'https://eu.i.posthog.com',
    autocapture: false,
    before_send: (event) =>
      event && {
        ...event,
        $set: withoutShareIds(event.$set),
        $set_once: withoutShareIds(event.$set_once),
        properties: withoutShareIds(event.properties),
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
