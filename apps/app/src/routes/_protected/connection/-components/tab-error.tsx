import { isConnectionFailure } from '@tamery/connection/diagnose'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { toError } from '@tamery/shared/utils'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { BridgeError } from '~/core/runtime/bridge/bridge'
import { TableError } from '~/core/table/table-error'

export const TabError = ({ error }: ErrorComponentProps) => {
  const failure = toError(error)
  // The connection's own boundary shows these: they are about reaching it, not about this tab.
  if (
    isKeychainLocked(error) ||
    error instanceof BridgeError ||
    isConnectionFailure(failure.message)
  ) {
    throw error
  }
  return <TableError error={failure} />
}
