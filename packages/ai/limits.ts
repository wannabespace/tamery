import type { Plan } from '@tamery/shared/permissions'

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

/** What the chat agent may spend per user message and per rolling day. Guest and Free have no chat (`ai.chat.use`), so theirs only matter once that gate opens. */
export const AGENT_LIMITS: Record<
  Plan,
  { day: AgentBudget; message: AgentBudget }
> = {
  free: {
    day: { steps: 40, tokens: 400_000 },
    message: { steps: 10, tokens: 150_000 },
  },
  guest: {
    day: { steps: 0, tokens: 0 },
    message: { steps: 0, tokens: 0 },
  },
  pro: {
    day: { steps: 400, tokens: 4_000_000 },
    message: { steps: 25, tokens: 500_000 },
  },
}
