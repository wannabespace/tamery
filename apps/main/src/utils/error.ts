import { ORPCError } from '@orpc/client'
import {
  SESSION_EXPIRED_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
} from '@tamery/shared/constants'
import { hasErrorCode } from '@tamery/shared/orpc-error'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { posthog } from '~/lib/posthog'

const getErrorMessage = (error: unknown) =>
  (error instanceof ORPCError && error.message) ||
  (error as Error)?.message ||
  UNKNOWN_ERROR_MESSAGE

const isSessionExpiredError = (error: unknown) =>
  (typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 401) ||
  hasErrorCode(error, 'UNAUTHORIZED')

export const handleError = async (error: unknown) => {
  if (!error) {
    return
  }

  const shouldIgnoreError =
    error instanceof Error
      ? error.name === 'AbortError' ||
        error.message.includes('net::') ||
        error.message.toLowerCase().includes('failed to fetch') ||
        error.message.toLowerCase().includes('cannot parse response body')
      : false

  if (shouldIgnoreError) {
    return
  }

  if (isSessionExpiredError(error)) {
    toast.info(SESSION_EXPIRED_MESSAGE, {
      id: 'session-expired',
    })
    void posthog.reset()
    await authClient.signOut()
    return
  }

  const message = getErrorMessage(error)

  toast.error(message, { id: `error-${message}` })
}
