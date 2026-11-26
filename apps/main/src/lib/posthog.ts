import type { PostHog } from 'posthog-js'

let instance: Promise<PostHog> | null = null

/** Sign-in and deep-link URLs carry an email, a share path or a sign-in challenge in their query, and a share's URL alone opens it. */
const keepPageOnly = (_key: string, value: unknown) => {
  if (typeof value !== 'string' || !/^https?:\/\//u.test(value)) {
    return value
  }
  const url = URL.parse(value)
  if (!url) {
    return value
  }
  return url.origin === new URL(import.meta.env.VITE_PUBLIC_SHARE_URL).origin
    ? url.origin
    : `${url.origin}${url.pathname}`
}

const withoutUrlDetails = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value, keepPageOnly))

const init = async () => {
  const { default: posthogJs } = await import('posthog-js')

  // Memory persistence and no recording keep the site cookieless: the privacy policy promises the website stores nothing on the device.
  const client = posthogJs.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: 'https://eu.i.posthog.com',
    autocapture: false,
    before_send: (event) =>
      event && {
        ...event,
        $set: withoutUrlDetails(event.$set),
        $set_once: withoutUrlDetails(event.$set_once),
        properties: withoutUrlDetails(event.properties),
      },
    defaults: '2026-01-30',
    disable_session_recording: true,
    persistence: 'memory',
  })
  client.register({ app: 'site' })
  return client
}

const load = () =>
  typeof window !== 'undefined' && import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN
    ? (instance ??= init())
    : null

const withClient = async (run: (client: PostHog) => void) => {
  const client = await load()
  if (client) {
    run(client)
  }
}

export const posthog = {
  capture: (...args: Parameters<PostHog['capture']>) =>
    withClient((client) => client.capture(...args)),
  reset: () => withClient((client) => client.reset()),
  start: load,
}
