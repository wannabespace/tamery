import { ORPCError } from '@orpc/client'
import type { COMMON_ERROR_STATUS_MAP } from '@orpc/client'

type CommonErrorCode = keyof typeof COMMON_ERROR_STATUS_MAP

/** `code` is typed against oRPC's common codes, so a misspelled one fails to compile instead of never matching. */
export const hasErrorCode = <TCode extends CommonErrorCode>(
  error: unknown,
  code: TCode
): error is ORPCError<TCode, unknown> =>
  error instanceof ORPCError && error.code === code
