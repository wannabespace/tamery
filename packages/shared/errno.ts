import type { constants } from 'node:os'

/** `code` is typed against Node's errno names, so a misspelled one fails to compile instead of never matching. */
export const hasErrnoCode = (
  error: unknown,
  code: keyof typeof constants.errno
) => error instanceof Error && 'code' in error && error.code === code
