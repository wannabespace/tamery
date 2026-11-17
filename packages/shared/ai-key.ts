/** The model providers whose API key a user can bring; the AI chat then runs on that provider on the user's bill instead of Tamery's. */
export const AI_KEY_PROVIDERS = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
} as const

export type AiKeyProvider = keyof typeof AI_KEY_PROVIDERS
