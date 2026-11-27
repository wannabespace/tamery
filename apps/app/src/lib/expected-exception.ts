import {
  isConnectionFailure,
  isProxyFailure,
} from '@tamery/connection/diagnose'

const EXPECTED_ERRORS = [
  'resizeobserver loop',
  'failed to fetch',
  'network error',
  'networkerror',
]

const isExpectedError = (message: string) => {
  const lower = message.toLowerCase()
  return EXPECTED_ERRORS.some((error) => lower.includes(error))
}

/** `messages` holds every entry of one `$exception_list`, where PostHog lists each cause on its own: a proxy failure caused by "Failed to fetch" is the cloud proxy's outage while the device is online, and an expected failure while it is offline. */
export const isExpectedException = (messages: string[], online: boolean) =>
  !(online && messages.some(isProxyFailure)) &&
  messages.some(
    (message) => isExpectedError(message) || isConnectionFailure(message)
  )
