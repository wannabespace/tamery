import { isConnectionFailure } from '@tamery/connection/diagnose'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { toError } from '@tamery/shared/utils'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { UnconfirmedConnectionError } from '~/core/runtime/bridge/bridge'
import { BridgeError } from '~/core/runtime/bridge/status'
import { BridgeFailure } from '~/modules/bridge/bridge-failure'
import { BridgeUnconfirmed } from '~/modules/bridge/bridge-unconfirmed'

import { ConnectionFailure } from './connection-failure'

export const ConnectionError = (props: ErrorComponentProps) => {
  if (props.error instanceof BridgeError) {
    return <BridgeFailure error={props.error} reset={props.reset} />
  }
  if (props.error instanceof UnconfirmedConnectionError) {
    return <BridgeUnconfirmed error={props.error} reset={props.reset} />
  }
  if (
    isKeychainLocked(props.error) ||
    !isConnectionFailure(toError(props.error).message)
  ) {
    throw props.error
  }
  return <ConnectionFailure {...props} />
}
