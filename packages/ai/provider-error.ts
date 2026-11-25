import { APICallError, RetryError } from 'ai'

/** Logs which operation failed and how, never the error itself: a provider error's message, stack and fields can carry the request and response, which hold chat text and database content. */
export const logProviderError = (operation: string, error: unknown) => {
  const cause = RetryError.isInstance(error) ? error.lastError : error
  console.error(`${operation} failed`, {
    status: APICallError.isInstance(cause) ? (cause.statusCode ?? null) : null,
    type: cause instanceof Error ? cause.name : typeof cause,
  })
}
