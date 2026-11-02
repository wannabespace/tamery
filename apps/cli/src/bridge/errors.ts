import { bridgeNeedsSecrets, bridgeUnconfirmed } from '@tamery/shared/bridge'

export const queryErrors = {
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
}
