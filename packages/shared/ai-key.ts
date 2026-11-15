/** The model providers whose API key a user can bring; AI calls then go to that provider on the user's bill instead of Tamery's. */
export const AI_KEY_PROVIDERS = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
} as const

export type AiKeyProvider = keyof typeof AI_KEY_PROVIDERS

/** How every AI limit and Pro prompt names the alternative to paying Tamery. */
export const AI_KEY_HINT = 'or add your own AI provider key in Settings → AI'
