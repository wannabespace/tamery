export const AI_QUERY_LIMITS = {
  context: 60_000,
  error: 4000,
  imageBytes: 5 * 1024 * 1024,
  images: 4,
  prompt: 2000,
  query: 30_000,
} as const

/** Ghost-text completions a non-Pro member may fetch per rolling 7 days; Pro is unlimited. */
export const COMPLETE_QUERY_WEEKLY_LIMIT = 200
