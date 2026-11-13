import { type } from 'arktype'

import type { AppUIMessage } from '../message'
import { textFromMessage } from '../message'
import type { ChatModelId } from '../models/list'
import {
  AUTO_CHAT_MODELS,
  chatModels,
  DEFAULT_CHAT_MODEL,
} from '../models/list'
import type { JevUsage } from './jev'
import { askJev } from './jev'

// One level per model of `AUTO_CHAT_MODELS`, in the same order.
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
  onJevUsage: (usage: JevUsage) => Promise<void>
) => {
  const request = textFromMessage(message).slice(0, REQUEST_LIMIT)
  if (!request) {
    return STANDARD_TIER
  }
  try {
    const answers = await askJev({
      onUsage: onJevUsage,
      questions: { difficulty: DIFFICULTY },
      state: { request },
    })
    return Math.round(difficultyAnswer.assert(answers.difficulty).score)
  } catch (error) {
    console.error('jev difficulty failed', error)
    return STANDARD_TIER
  }
}

/** The user's pick, or Auto's when they picked none or one no longer offered. Auto has Jev rate each new user turn, keeps a turn's tool steps on the model that started it, and never steps a chat down a tier: a lighter model would read the whole history again without the previous model's prompt cache. */
export const pickChatModel = async (data: {
  messages: AppUIMessage[]
  model?: string
  onJevUsage: (usage: JevUsage) => Promise<void>
}): Promise<ChatModelId> => {
  const picked = chatModels.find((model) => model.id === data.model)
  if (picked) {
    return picked.id
  }
  const previous = data.messages.findLast(
    (message) => message.role === 'assistant'
  )?.metadata?.model
  const turn = data.messages.at(-1)
  if (turn?.role !== 'user') {
    return previous ?? AUTO_CHAT_MODELS[STANDARD_TIER] ?? DEFAULT_CHAT_MODEL
  }
  const floor = previous ? AUTO_CHAT_MODELS.indexOf(previous) : -1
  const tier = Math.max(floor, await rate(turn, data.onJevUsage))
  return AUTO_CHAT_MODELS[tier] ?? DEFAULT_CHAT_MODEL
}
