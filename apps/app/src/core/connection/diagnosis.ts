import { connectionParts } from '@tamery/connection/connection-parts'
import {
  adviseRetry,
  diagnoseConnectionError,
  isConnectionFailure,
  isProxyFailure,
} from '@tamery/connection/diagnose'
import { isLocalHost } from '@tamery/connection/hosts'
import { queryOptions, useQuery } from '@tanstack/react-query'

import { getCollections } from '~/core/collections'
import { failedAttempt } from '~/lib/failed-attempt'
import { posthog } from '~/lib/posthog'
import { useIsOnline } from '~/store'

const NETWORK_ERROR_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
]

const reported = new WeakSet<Error>()

/** Counts a saved connection's failed statement once, where the plain string is still at hand: no diagnosis read or decrypt has to follow. */
export const reportConnectionFailure = (
  error: unknown,
  connectionString: string
) => {
  if (
    !(error instanceof Error) ||
    reported.has(error) ||
    !isConnectionFailure(error.message)
  ) {
    return
  }
  reported.add(error)
  const { host, type } = connectionParts.parse(connectionString)
  posthog.capture('connection_failed', {
    db_type: type,
    error_code: isProxyFailure(error.message)
      ? 'proxy'
      : (NETWORK_ERROR_CODES.find((code) => error.message.includes(code)) ??
        'other'),
    is_local: isLocalHost(host),
  })
}

/** Caches only what the card and the screen show: a fix patch carries the decrypted driver options, and the key names the attempt, never its message. */
export const diagnosisQueryOptions = (connectionId: string, error: Error) => {
  const attempt = failedAttempt(error)
  return queryOptions({
    placeholderData: undefined,
    queryFn: async () => {
      const parts = connectionParts.parse(
        await getCollections().connectionStringsCollection.utils.decrypt(
          connectionId
        )
      )
      const diagnosis = diagnoseConnectionError({
        desktop: !!window.electron,
        message: error.message,
        online: attempt.online,
        parts,
      })
      return (
        diagnosis && {
          hint: diagnosis.hint,
          ...(diagnosis.offline && { offline: true as const }),
          title: diagnosis.title,
        }
      )
    },
    queryKey: ['connection', connectionId, 'diagnosis', attempt.id],
    throwOnError: false,
  })
}

/** `undefined` while the diagnosis loads, so a screen shows neither the raw error nor a stale diagnosis in the meantime. */
export const useDiagnosis = (connectionId: string, error: Error) => {
  const online = useIsOnline()
  const { data, isPending } = useQuery(
    diagnosisQueryOptions(connectionId, error)
  )
  return isPending ? undefined : adviseRetry(data ?? null, online)
}
