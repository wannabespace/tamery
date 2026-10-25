import { Alert02Icon } from '@hugeicons/core-free-icons'
import { toError } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useNavigate } from '@tanstack/react-router'

import { useDiagnosis } from '~/core/connection/diagnosis'
import { useConnectionContext } from '~/core/connection/route'
import { useGoBack } from '~/hooks/use-go-back'
import { posthog } from '~/lib/posthog'

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
