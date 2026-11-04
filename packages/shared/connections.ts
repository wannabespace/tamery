import { RECONNECT_ERROR_PATTERNS } from './constants'

export const isConnectionError = (error: unknown): error is Error => {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      RECONNECT_ERROR_PATTERNS.some((pattern) =>
        msg.includes(pattern.toLowerCase())
      ) || isConnectionError(error.cause)
    )
  }
  return false
}
