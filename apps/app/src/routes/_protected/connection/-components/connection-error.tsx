import { isConnectionFailure } from '@tamery/connection/diagnose'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { toError } from '@tamery/shared/utils'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { UnconfirmedConnectionError } from '~/core/runtime/bridge/bridge'
import { BridgeError } from '~/core/runtime/bridge/status'
import { BridgeFailure } from '~/modules/bridge/bridge-failure'
import { BridgeUnconfirmed } from '~/modules/bridge/bridge-unconfirmed'

import { ConnectionFailure } from './connection-failure'

export const ConnectionError = (props: ErrorComponentProps) => {
  const queryErrors = useQueryErrorResetBoundary()
  const retry = () => {
    // A failed query stays failed for an error boundary until its reset boundary lets it retry on mount.
    queryErrors.reset()
    props.reset()
  }
  if (props.error instanceof BridgeError) {
    return <BridgeFailure error={props.error} retry={retry} />
  }
  if (props.error instanceof UnconfirmedConnectionError) {
    return <BridgeUnconfirmed error={props.error} retry={retry} />
  }
  if (
    isKeychainLocked(props.error) ||
    !isConnectionFailure(toError(props.error).message)
  ) {
    throw props.error
  }
  return <ConnectionFailure {...props} />
}
