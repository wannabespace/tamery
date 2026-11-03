import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/client'
import {
  PROXY_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
} from '@tamery/shared/constants'
import { hasErrorCode } from '@tamery/shared/orpc-error'
import { toast } from 'sonner'

import { fullSignOut, isAnonymous } from '~/lib/auth'
import { isAuthLocation } from '~/lib/last-location'
import { promptSignIn } from '~/store'

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

const errorStatus: Record<string, number | undefined> = COMMON_ERROR_STATUS_MAP

export const isServerError = (error: unknown) =>
  error instanceof ORPCError
    ? (errorStatus[error.code] ?? 500) >= 500
    : typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number' &&
      error.status >= 500

export const handleError = async (
  error: unknown,
  { context }: { context?: { silent?: boolean } } = {}
) => {
  if (!error) {
    return
  }

  const shouldIgnoreError =
    error instanceof Error
      ? error.name === 'AbortError' ||
        error.message.includes('net::') ||
        error.message.toLowerCase().includes('failed to fetch') ||
        error.message.toLowerCase().includes('cannot parse response body') ||
        error.message.includes(PROXY_ERROR_MESSAGE)
      : false

  if (shouldIgnoreError || (!navigator.onLine && isServerError(error))) {
    return
  }

  if (isSessionExpiredError(error)) {
    if (isAuthLocation()) {
      return
    }

    toast.info(SESSION_EXPIRED_MESSAGE, {
      id: 'session-expired',
    })
    await fullSignOut()
    return
  }

  if (context?.silent) {
    return
  }

  if (hasErrorCode(error, 'FORBIDDEN') && isAnonymous() && !isAuthLocation()) {
    promptSignIn(error.message)
    return
  }

  const message = getErrorMessage(error)

  toast.error(
    isServerError(error)
      ? 'Something went wrong with our server. You can continue working, but some features may not work as expected.'
      : message,
    { id: `error-${message}` }
  )
}
