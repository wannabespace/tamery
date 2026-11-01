import { bridgeNeedsSecrets } from '@tamery/shared/bridge'

export const NEEDS_SECRETS_MESSAGE =
  'Enter the missing connection details to run it on the bridge.'
export const NOT_FOUND_MESSAGE = 'This connection is not in your account.'

export const authErrors = {
  UNAUTHORIZED: { message: 'This browser is not paired with the bridge.' },
}

/** Thrown from the connection resolver, so they are declared on the builder every query procedure grows from. */
export const queryErrors = {
  NEEDS_SECRETS: {
    data: bridgeNeedsSecrets,
    message: NEEDS_SECRETS_MESSAGE,
  },
  NOT_FOUND: { message: NOT_FOUND_MESSAGE },
}

export const pairErrors = {
  INVALID_CODE: {
    message:
      'This pairing code is wrong or expired. Restart `tamery bridge` for a new one.',
  },
  OTHER_ACCOUNT: {
    message:
      'This bridge is signed in to another Tamery account. Sign in to that one here, or run `tamery logout` and `tamery bridge` on that computer.',
  },
}
