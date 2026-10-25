export const AI_QUERY_LIMITS = {
  context: 60_000,
  error: 4000,
  imageBytes: 5 * 1024 * 1024,
  images: 4,
  prompt: 2000,
  query: 30_000,
} as const
