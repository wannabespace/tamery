import { PostHog } from 'posthog-node'

import { env } from '~/env'

export const posthog = env.POSTHOG_TOKEN
  ? new PostHog(env.POSTHOG_TOKEN, {
      // A crash skips the flush on SIGTERM, and a batched event would die with the instance.
      flushAt: 1,
      host: 'https://eu.i.posthog.com',
    })
  : null
