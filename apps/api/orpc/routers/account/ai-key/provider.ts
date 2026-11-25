import { AI_KEY_PROVIDERS } from '@tamery/shared/ai-key'
import { objectEntries } from '@tamery/shared/utils'
import { type } from 'arktype'

export const aiKeyProvider = type.enumerated(
  ...objectEntries(AI_KEY_PROVIDERS).map(([provider]) => provider)
)
