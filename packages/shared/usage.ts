export const FREE_SHARE_LIMIT = 3

export const FREE_SHARE_LIMIT_MESSAGE = `The Free plan keeps ${FREE_SHARE_LIMIT} shared links at a time. Stop sharing one in Manage shares, or upgrade to share as many as you need.`

export const FREE_WEEKLY_LIMITS = {
  complete: 200,
  filters: 20,
  mcp: 100,
} as const

export type MeteredFeature = keyof typeof FREE_WEEKLY_LIMITS

export const usageResetsAt = (now = new Date()) =>
  Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - ((now.getUTCDay() + 6) % 7) + 7
  )
