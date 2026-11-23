import { isConnectionFailure } from '@tamery/connection/diagnose'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { toError } from '@tamery/shared/utils'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { UnconfirmedConnectionError } from '~/core/runtime/machine/machine'
import { MachineNotPairedError } from '~/core/runtime/machine/not-paired'
import { MachineError } from '~/core/runtime/machine/status'
import { MachineFailure } from '~/modules/machine/machine-failure'
import { MachineNotPaired } from '~/modules/machine/machine-not-paired'
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
  if (props.error instanceof MachineNotPairedError) {
    return <MachineNotPaired route={props.error.route} retry={retry} />
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
