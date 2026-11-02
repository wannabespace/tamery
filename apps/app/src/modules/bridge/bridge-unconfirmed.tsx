import { ComputerIcon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { useMutation, useQueryErrorResetBoundary } from '@tanstack/react-query'

import { FetchingReason } from '~/core/connection/fetching-reason'
import type { UnconfirmedConnectionError } from '~/core/runtime/bridge/bridge'
import { bridge } from '~/core/runtime/bridge/bridge'

export const BridgeUnconfirmed = ({
  error: { connectionId, message },
  reset,
}: {
  error: UnconfirmedConnectionError
  reset: () => void
}) => {
  const queryErrors = useQueryErrorResetBoundary()
  const allow = useMutation({
    meta: { event: 'bridge_connection_allowed' },
    mutationFn: async () => {
      if (!(await bridge.saveSecrets(connectionId))) {
        throw new Error(
          'This browser lacks some of this connection’s details. Enter them, then allow it again.'
        )
      }
    },
    onSuccess: () => {
      // A failed query stays failed for an error boundary until its reset boundary lets it retry on mount.
      queryErrors.reset()
      reset()
    },
  })

  return (
    <div className="flex h-screen min-h-[inherit] flex-col">
      <IconEmpty
        icon={ComputerIcon}
        title="Allow this connection on the bridge"
        description={
          <FetchingReason
            reason={allow.error ? allow.error.message : message}
          />
        }
      >
        <Button disabled={allow.isPending} onClick={() => allow.mutate()}>
          <LoadingContent loading={allow.isPending}>Allow</LoadingContent>
        </Button>
      </IconEmpty>
    </div>
  )
}
