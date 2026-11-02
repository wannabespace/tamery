import { bridgeNeedsSecrets } from '@tamery/shared/bridge'

export const NEEDS_SECRETS_MESSAGE =
  'Enter the missing connection details to run it on the bridge.'
export const NOT_FOUND_MESSAGE = 'This connection is not in your account.'
export const UNCONFIRMED_MESSAGE =
  'This connection opens a file or signs in with credentials from this computer, and those settings were not saved in your browser. Edit the connection and save it to run it on the bridge.'

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
  UNCONFIRMED: { message: UNCONFIRMED_MESSAGE },
}

export const saveErrors = {
  ACCESS_DECLINED: {
    message:
      "The bridge did not allow this connection to open files or sign in with its computer's keys or credentials: it was declined, or nobody answered within 2 minutes. Save it again and allow it in the terminal running `tamery bridge`, or with `tamery bridge approve`.",
  },
}

export const pairErrors = {
  DECLINED: {
    message:
      'The bridge did not allow this browser: it was declined, or nobody answered within 2 minutes. Click Connect again and allow it in the terminal running `tamery bridge`, or with `tamery bridge approve`.',
  },
  NOT_ATTESTED: {
    message:
      'The bridge could not confirm its account with Tamery. Check that it is online and signed in, then pair again.',
  },
  OTHER_ACCOUNT: {
    message:
      'This bridge is signed in to another Tamery account. Sign in to that one here, or run `tamery logout` and `tamery bridge` on that computer.',
  },
}
