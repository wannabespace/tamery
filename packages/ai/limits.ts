export const AI_QUERY_LIMITS = {
  context: 60_000,
  error: 4000,
  imageBytes: 5 * 1024 * 1024,
  images: 4,
  prompt: 2000,
  query: 30_000,
} as const

export interface AgentBudget {
  steps: number
  tokens: number
}

/** The chat agent's budget, Pro only (`ai.chat.use`): what one user message may take before it pauses, and what its model calls may cost in a month, the price of the subscription. */
export const CHAT_LIMITS = {
  message: { steps: 25, tokens: 500_000 },
  monthlyCostUsd: 15,
} as const
