import { ORPCError } from '@orpc/client'

export interface FailedAttempt {
  id: string
  online: boolean
}

const attempts = new WeakMap<Error, FailedAttempt>()

/** The query and mutation caches call it as each attempt fails, so later reads keep the network it failed on. An error the cloud proxy or a machine answered with crossed this device's network, so it never counts as offline. */
export const failedAttempt = (error: Error) => {
  const known = attempts.get(error)
  if (known) {
    return known
  }
  const attempt = {
    id: crypto.randomUUID(),
    online: navigator.onLine || error instanceof ORPCError,
  }
  attempts.set(error, attempt)
  return attempt
}
