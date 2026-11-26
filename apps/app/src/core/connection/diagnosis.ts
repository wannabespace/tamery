import { connectionParts } from '@tamery/connection/connection-parts'
import { diagnoseConnectionError } from '@tamery/connection/diagnose'
import { isLocalHost } from '@tamery/connection/hosts'
import { useQuery } from '@tanstack/react-query'

import { useCollections } from '~/core/collections'
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

export const useDiagnosis = (connectionId: string, error: Error) => {
  const { connectionStringsCollection } = useCollections()
  const online = useIsOnline()
  const parts = useQuery({
    queryFn: async () => {
      const parsed = connectionParts.parse(
        await connectionStringsCollection.utils.decrypt(connectionId)
      )
      posthog.capture('connection_failed', {
        db_type: parsed.type,
        error_code:
          NETWORK_ERROR_CODES.find((code) => error.message.includes(code)) ??
          'other',
        is_local: isLocalHost(parsed.host),
      })
      return parsed
    },
    queryKey: ['connection', connectionId, 'diagnosis', error.message],
    throwOnError: false,
  }).data
  return parts
    ? diagnoseConnectionError({
        desktop: !!window.electron,
        message: error.message,
        online,
        parts,
      })
    : null
}
