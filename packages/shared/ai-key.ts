/** The model providers whose API key a user can bring; the AI chat then runs on that provider on the user's bill instead of Tamery's. */
export const AI_KEY_PROVIDERS = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
} as const

export type AiKeyProvider = keyof typeof AI_KEY_PROVIDERS

/** The models a key can dictate with, its default first; Anthropic's take no audio. */
export const DICTATION_MODELS = {
  anthropic: [],
  google: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon' },
  ],
  openai: [
    { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe' },
    { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o mini Transcribe' },
    { id: 'whisper-1', name: 'Whisper' },
  ],
  openrouter: [
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    { id: 'google/gemini-4-argon', name: 'Gemini 4 Argon' },
  ],
} satisfies Record<AiKeyProvider, { id: string; name: string }[]>

/** The picked dictation model when the key's provider offers it, else its default; null for a provider with none. */
export const getDictationModel = (
  provider: AiKeyProvider,
  picked: string | null
) => {
  const offered: { id: string }[] = DICTATION_MODELS[provider]
  return (offered.find(({ id }) => id === picked) ?? offered[0])?.id ?? null
}
