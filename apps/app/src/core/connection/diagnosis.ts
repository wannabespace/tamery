import { connectionParts } from '@tamery/connection/connection-parts'
import { diagnoseConnectionError } from '@tamery/connection/diagnose'
import { isLocalHost } from '@tamery/connection/hosts'
import { useQuery } from '@tanstack/react-query'

import { useCollections } from '~/core/collections'
import { posthog } from '~/lib/posthog'

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

export const useDiagnosis = (connectionId: string, error: Error) => {
  const { connectionStringsCollection } = useCollections()
  return useQuery({
    queryFn: async () => {
      const parts = connectionParts.parse(
        await connectionStringsCollection.utils.decrypt(connectionId)
      )
      posthog.capture('connection_failed', {
        db_type: parts.type,
        error_code:
          NETWORK_ERROR_CODES.find((code) => error.message.includes(code)) ??
          'other',
        is_local: isLocalHost(parts.host),
      })
      return diagnoseConnectionError({
        desktop: !!window.electron,
        message: error.message,
        parts,
      })
    },
    queryKey: ['connection', connectionId, 'diagnosis', error.message],
    throwOnError: false,
  }).data
}
