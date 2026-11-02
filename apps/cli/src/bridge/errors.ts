import { bridgeNeedsSecrets } from '@tamery/shared/bridge'

export const queryErrors = {
  NEEDS_SECRETS: {
    data: bridgeNeedsSecrets,
    message: 'Enter the missing connection details to run it on the bridge.',
  },
  NOT_FOUND: { message: 'This connection is not in your account.' },
  UNCONFIRMED: {
    message:
      'This connection opens a file or signs in with credentials from this computer, and those settings were not saved in your browser. Edit the connection and save it to run it on the bridge.',
  },
}
