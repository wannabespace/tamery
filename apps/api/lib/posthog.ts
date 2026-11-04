import { PostHog } from 'posthog-node'

import { env } from '~/env'

export const posthog = env.POSTHOG_TOKEN
  ? new PostHog(env.POSTHOG_TOKEN, {
      // Nothing flushes on shutdown, so a batched event dies with the instance on a redeploy.
      flushAt: 1,
      host: 'https://eu.i.posthog.com',
    })
  : null
