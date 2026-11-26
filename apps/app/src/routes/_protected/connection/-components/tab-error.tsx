import {
  adviseRetry,
  isConnectionFailure,
  isProxyFailure,
  OFFLINE_DIAGNOSIS,
} from '@tamery/connection/diagnose'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { toError } from '@tamery/shared/utils'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { UnconfirmedConnectionError } from '~/core/runtime/machine/machine'
import { MachineNotPairedError } from '~/core/runtime/machine/not-paired'
import { MachineError } from '~/core/runtime/machine/status'
import { TableError } from '~/core/table/table-error'
import { failedAttempt } from '~/lib/failed-attempt'
import { useIsOnline } from '~/store'

export const TabError = ({ error }: ErrorComponentProps) => {
  const online = useIsOnline()
  const failure = toError(error)
  if (
    isKeychainLocked(error) ||
    error instanceof MachineError ||
    error instanceof MachineNotPairedError ||
    error instanceof UnconfirmedConnectionError ||
    (isConnectionFailure(failure.message) && !isProxyFailure(failure.message))
  ) {
    throw error
  }
  const offline =
    isProxyFailure(failure.message) && !failedAttempt(failure).online
  const diagnosis = adviseRetry(offline ? OFFLINE_DIAGNOSIS : null, online)
  return (
    <TableError
      error={failure}
      title={diagnosis?.title ?? 'Couldn’t open this tab'}
    />
  )
}
