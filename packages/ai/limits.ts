export const AI_QUERY_LIMITS = {
  context: 60_000,
  error: 4000,
  imageBytes: 5 * 1024 * 1024,
  images: 4,
  prompt: 2000,
  query: 30_000,
} as const

export const CHAT_TURN_LIMITS = {
  steps: 25,
  tokens: 500_000,
} as const
