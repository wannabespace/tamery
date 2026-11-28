// Never compare against authClient.$ERROR_CODES: it exists only in Better Auth's types, at runtime it is a path proxy and no code ever equals it.
export const SESSION_NOT_FRESH_CODE = 'SESSION_NOT_FRESH'
