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
  attachmentBytes: 5 * 1024 * 1024,
  attachmentTypes: new Set([
    'application/pdf',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]),
  attachments: 4,
  message: { steps: 25, tokens: 500_000 },
  monthlyCostUsd: 15,
} as const

/** A dictated message: the window records 16-bit mono WAV at this rate for at most this long, and the API rejects anything larger. */
export const DICTATION = { sampleRate: 16_000, seconds: 120 } as const
