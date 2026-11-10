import process from 'node:process'

import { silently } from '@tamery/shared/utils'
import { PostHog } from 'posthog-node'

import { env } from './env'
import { vault } from './vault'

const SHUTDOWN_TIMEOUT_MS = 2000

let client: PostHog | null = null

const DO_NOT_TRACK = /^(?:1|true)$/iu.test(process.env.DO_NOT_TRACK ?? '')

/** Properties carry enums and counts only, never names, SQL, values or error messages (the privacy policy promises it). */
export const analytics = {
  /** Never throws: a locked keychain or a dead network must not fail what the user did. */
  capture: (
    event: string,
    properties: Record<string, boolean | number | string | null>
  ) =>
    silently(async () => {
      const posthog =
        env.POSTHOG_TOKEN && !DO_NOT_TRACK
          ? (client ??= new PostHog(env.POSTHOG_TOKEN, {
              flushAt: 1,
              host: 'https://eu.i.posthog.com',
            }))
          : null
      const account = posthog && (await vault.account())
      if (account) {
        posthog.capture({
          distinctId: account.id,
          event,
          properties: {
            app: 'cli',
            app_version: env.VERSION,
            os: process.platform,
            ...properties,
          },
        })
      }
    }),
  /** Every command exits through `process.exit`, which drops whatever has not been sent. */
  shutdown: () => silently(() => client?.shutdown(SHUTDOWN_TIMEOUT_MS)),
}
