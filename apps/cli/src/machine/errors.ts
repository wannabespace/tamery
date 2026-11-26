import type { ORPCErrorConstructorMap } from '@orpc/server'
import {
  SSH_MACHINE_HOST_KEY_UNKNOWN,
  SSH_TUNNEL_ERROR,
} from '@tamery/connection/ssh/params'
import {
  machineHostKey,
  machineNeedsSecrets,
  machineUnconfirmed,
} from '@tamery/shared/machine'

export const queryErrors = {
  BAD_REQUEST: {},
  NEEDS_SECRETS: {
    data: machineNeedsSecrets,
    message: 'Enter the missing connection details to run it on the machine.',
  },
  NOT_FOUND: { message: 'This connection is not in your account.' },
  UNCONFIRMED: {
    data: machineUnconfirmed,
    message:
      'This connection opens a file or signs in with credentials from this computer, and nobody allowed these settings on the machine yet. Allow them to run it there.',
  },
  UNKNOWN_HOST_KEY: {
    data: machineHostKey,
    message: `${SSH_TUNNEL_ERROR}${SSH_MACHINE_HOST_KEY_UNKNOWN}`,
  },
}

export type QueryErrors = ORPCErrorConstructorMap<typeof queryErrors>
