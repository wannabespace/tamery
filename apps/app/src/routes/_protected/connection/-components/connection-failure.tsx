import { Alert02Icon } from '@hugeicons/core-free-icons'
import { connectionParts } from '@tamery/connection/connection-parts'
import { isLocalHost } from '@tamery/connection/hosts'
import { silently, toError } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useCollections } from '~/core/collections'
import { useDiagnosis } from '~/core/connection/diagnosis'
import { useConnectionContext } from '~/core/connection/route'
import { useGoBack } from '~/hooks/use-go-back'
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

export const ConnectionFailure = ({
  error: thrown,
  reset,
}: ErrorComponentProps) => {
  const error = toError(thrown)
  const { connection } = useConnectionContext()
  const queryErrors = useQueryErrorResetBoundary()
  const goBack = useGoBack()
  const navigate = useNavigate()
  const diagnosis = useDiagnosis(connection.id, error)
  const { connectionStringsCollection } = useCollections()

  useEffect(() => {
    void silently(async () => {
      const { host } = connectionParts.parse(
        await connectionStringsCollection.utils.decrypt(connection.id)
      )
      posthog.capture('connection_failed', {
        db_type: connection.type,
        error_code:
          NETWORK_ERROR_CODES.find((code) => error.message.includes(code)) ??
          'other',
        is_local: isLocalHost(host),
      })
    })
  }, [
    connectionStringsCollection,
    connection.id,
    connection.type,
    error.message,
  ])

  return (
    <div className="flex h-screen min-h-[inherit] flex-col">
      <IconEmpty
        variant="destructive"
        icon={Alert02Icon}
        title={diagnosis?.title ?? "Couldn't connect"}
        description={
          <span data-mask className="flex flex-col gap-2 select-text">
            {diagnosis ? (
              <span>{diagnosis.hint}</span>
            ) : (
              <span className="font-mono wrap-anywhere">{error.message}</span>
            )}
          </span>
        }
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={goBack}>
            Back
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              posthog.capture('connection_retried')
              // A failed query stays failed for an error boundary until its reset boundary lets it retry on mount.
              queryErrors.reset()
              reset()
            }}
          >
            Try again
          </Button>
          <Button
            onClick={() => {
              posthog.capture('connection_edit_opened')
              void navigate({
                params: { connectionId: connection.id },
                to: '/edit/$connectionId',
              })
            }}
          >
            Edit connection
          </Button>
        </div>
      </IconEmpty>
    </div>
  )
}
