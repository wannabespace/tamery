import { connectionParts } from '@tamery/connection/connection-parts'
import {
  adviseRetry,
  diagnoseConnectionError,
} from '@tamery/connection/diagnose'
import { isLocalHost } from '@tamery/connection/hosts'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { queryOptions, useQuery } from '@tanstack/react-query'

import { useCollections } from '~/core/collections'
import type { FailedAttempt } from '~/lib/failed-attempt'
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

const reported = new WeakSet<FailedAttempt>()

/** Caches only what the card and the screen show: a fix patch carries the decrypted driver options, and the key names the attempt, never its message. */
export const diagnosisQueryOptions = (
  connectionId: string,
  error: Error,
  decrypt: (connectionId: string) => Promise<string>
) => {
  const attempt = failedAttempt(error)
  return queryOptions({
    placeholderData: undefined,
    queryFn: async () => {
      const parts = connectionParts.parse(await decrypt(connectionId))
      if (!reported.has(attempt)) {
        reported.add(attempt)
        posthog.capture('connection_failed', {
          db_type: parts.type,
          error_code:
            NETWORK_ERROR_CODES.find((code) => error.message.includes(code)) ??
            'other',
          is_local: isLocalHost(parts.host),
        })
      }
      const diagnosis = diagnoseConnectionError({
        desktop: !!window.electron,
        message: error.message,
        online: attempt.online,
        parts,
      })
      return (
        diagnosis && {
          hint: redactSecrets(diagnosis.hint),
          title: diagnosis.title,
        }
      )
    },
    queryKey: ['connection', connectionId, 'diagnosis', attempt.id],
    throwOnError: false,
  })
}

export const useDiagnosis = (connectionId: string, error: Error) => {
  const { connectionStringsCollection } = useCollections()
  const online = useIsOnline()
  const { data = null } = useQuery(
    diagnosisQueryOptions(connectionId, error, (id) =>
      connectionStringsCollection.utils.decrypt(id)
    )
  )
  return adviseRetry(data, online)
}
