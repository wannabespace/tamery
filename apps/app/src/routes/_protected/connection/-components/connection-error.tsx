import { isConnectionFailure } from '@tamery/connection/diagnose'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { toError } from '@tamery/shared/utils'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { UnconfirmedConnectionError } from '~/core/runtime/machine/machine'
import { MachineError } from '~/core/runtime/machine/status'
import { MachineFailure } from '~/modules/machine/machine-failure'
import { MachineUnconfirmed } from '~/modules/machine/machine-unconfirmed'

import { ConnectionFailure } from './connection-failure'

export const ConnectionError = (props: ErrorComponentProps) => {
  const queryErrors = useQueryErrorResetBoundary()
  const retry = () => {
    // A failed query stays failed for an error boundary until its reset boundary lets it retry on mount.
    queryErrors.reset()
    props.reset()
  }
  if (props.error instanceof MachineError) {
    return <MachineFailure error={props.error} retry={retry} />
  }
  if (props.error instanceof UnconfirmedConnectionError) {
    return <MachineUnconfirmed error={props.error} retry={retry} />
  }
  if (
    isKeychainLocked(props.error) ||
    !isConnectionFailure(toError(props.error).message)
  ) {
    throw props.error
  }
  return <ConnectionFailure {...props} />
}
