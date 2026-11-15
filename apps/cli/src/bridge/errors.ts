import type { ORPCErrorConstructorMap } from '@orpc/server'
import { SSH_TUNNEL_ERROR } from '@tamery/connection/ssh/params'
import {
  bridgeHostKey,
  bridgeNeedsSecrets,
  bridgeUnconfirmed,
} from '@tamery/shared/bridge'

export const queryErrors = {
  BAD_REQUEST: {},
  NEEDS_SECRETS: {
    data: bridgeNeedsSecrets,
    message: 'Enter the missing connection details to run it on the bridge.',
  },
  NOT_FOUND: { message: 'This connection is not in your account.' },
  UNCONFIRMED: {
    data: bridgeUnconfirmed,
    message:
      'This connection opens a file or signs in with credentials from this computer, and nobody allowed these settings on the bridge yet. Allow them to run it there.',
  },
  UNKNOWN_HOST_KEY: {
    data: bridgeHostKey,
    message: `${SSH_TUNNEL_ERROR}The bridge's computer doesn't know this SSH host's key. Trust it when Tamery asks (update Tamery if it doesn't), or connect to it once with ssh on that computer.`,
  },
}

export type QueryErrors = ORPCErrorConstructorMap<typeof queryErrors>
