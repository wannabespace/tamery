import { type } from 'arktype'

import type { AppUIMessage } from '../message'
import { textFromMessage } from '../message'
import type { ChatEffort, ChatModelId } from '../models/list'
import {
  AUTO_CHAT_EFFORTS,
  AUTO_CHAT_MODELS,
  DEFAULT_CHAT_EFFORT,
  DEFAULT_CHAT_MODEL,
} from '../models/list'
import type { AiKey } from '../models/own-key'
import {
  chatKeyFor,
  chatModelsFor,
  OWN_KEY_AUTO_MODELS,
} from '../models/own-key'
import { logProviderError } from '../provider-error'
import type { JevUsage } from './jev'
import { askJev } from './jev'

// One level per model of `AUTO_CHAT_MODELS` and effort of `AUTO_CHAT_EFFORTS`, in the same order.
const DIFFICULTY = {
  criteria: [
    'A lookup or one simple query: count rows, show a table, find a record, explain a column',
    'A few queries with joins or aggregations, or a single row edit or schema change',
    'Open-ended analysis, a multi-step change or migration, debugging slow or failing SQL, or comparing databases',
  ],
  instructions:
    'How hard is `request` for an AI agent working in a database client?',
  type: 'score',
}

const difficultyAnswer = type({ score: 'number' })

const REQUEST_LIMIT = 4000
const STANDARD_TIER = 1

const rate = async (
  message: AppUIMessage,
  onJevUsage: (usage: JevUsage) => Promise<void>,
  apiKey?: string
) => {
  const request = textFromMessage(message).slice(0, REQUEST_LIMIT)
  if (!request) {
    return STANDARD_TIER
  }
  try {
    const answers = await askJev({
      apiKey,
      onUsage: onJevUsage,
      questions: { difficulty: DIFFICULTY },
      state: { request },
    })
    return Math.round(difficultyAnswer.assert(answers.difficulty).score)
  } catch (error) {
    logProviderError('jev difficulty', error)
    return STANDARD_TIER
  }
}

interface ChatPick {
  /** Auto chose the model, so it may fall back to another company's. */
  auto: boolean
  effort: ChatEffort
  /** The own key the step runs on; null on Tamery's account. */
  key: AiKey | null
  model: ChatModelId
}

/** The user's pick, or Auto's when they picked none or one no longer offered. A picked model runs on the key that serves it, Auto on the first key. On a provider's own key Auto is that provider's model at the default effort, since Jev runs only on OpenRouter; otherwise it has Jev rate each new user turn and keeps a turn's tool steps on the model and effort that started it. The effort follows each turn's own rating, but a chat never steps down a model tier: a lighter model would read the whole history again without the previous model's prompt cache. */
export const pickChatModel = async (data: {
  effort?: ChatEffort
  keys: AiKey[]
  messages: AppUIMessage[]
  model?: string
  onJevUsage: (usage: JevUsage) => Promise<void>
}): Promise<ChatPick> => {
  const picked = chatModelsFor(data.keys).find(
    (model) => model.id === data.model
  )
  if (picked) {
    return {
      auto: false,
      effort: data.effort ?? DEFAULT_CHAT_EFFORT,
      key: chatKeyFor(data.keys, picked),
      model: picked.id,
    }
  }
  const [key = null] = data.keys
  if (key && key.provider !== 'openrouter') {
    return {
      auto: true,
      effort: DEFAULT_CHAT_EFFORT,
      key,
      model: OWN_KEY_AUTO_MODELS[key.provider],
    }
  }
  const previous = data.messages.findLast(
    (message) => message.role === 'assistant'
  )?.metadata
  const turn = data.messages.at(-1)
  if (turn?.role !== 'user') {
    return {
      auto: true,
      effort: previous?.effort ?? DEFAULT_CHAT_EFFORT,
      key,
      model:
        previous?.model ??
        AUTO_CHAT_MODELS[STANDARD_TIER] ??
        DEFAULT_CHAT_MODEL,
    }
  }
  const floor = previous?.model ? AUTO_CHAT_MODELS.indexOf(previous.model) : -1
  const level = await rate(turn, data.onJevUsage, key?.key)
  return {
    auto: true,
    effort: AUTO_CHAT_EFFORTS[level] ?? DEFAULT_CHAT_EFFORT,
    key,
    model: AUTO_CHAT_MODELS[Math.max(floor, level)] ?? DEFAULT_CHAT_MODEL,
  }
}
