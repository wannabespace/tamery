import type { PostHog } from 'posthog-js'

let instance: Promise<PostHog> | null = null

const init = async () => {
  const { default: posthogJs } = await import('posthog-js')

  // Memory persistence and no recording keep the site cookieless: the privacy policy promises the website stores nothing on the device.
  const client = posthogJs.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: 'https://eu.i.posthog.com',
    autocapture: false,
    // Sign-in pages carry an email, a share path or a sign-in challenge in their query.
    custom_personal_data_properties: [
      'codeChallenge',
      'email',
      'path',
      'redirectPath',
    ],
    defaults: '2026-01-30',
    disable_session_recording: true,
    mask_personal_data_properties: true,
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
  identify: (...args: Parameters<PostHog['identify']>) =>
    withClient((client) => client.identify(...args)),
  reset: () => withClient((client) => client.reset()),
  start: load,
}
