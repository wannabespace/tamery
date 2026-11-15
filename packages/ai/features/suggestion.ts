import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import type { AppUIMessage } from '../message'
import { textFromMessage } from '../message'
import { models } from '../models/list'
import { section } from './prompt'

const SUGGESTION_INSTRUCTIONS = [
  "Guess the user's next message in a chat with a database assistant, from their last message under MESSAGE and the assistant's answer under ANSWER.",
  'Write it as the user would type it to the assistant: a short request that takes the work one natural step further, never a reply to the answer and never a question to the user.',
  "Use the user's language. At most 60 characters, sentence case, no trailing punctuation, no quotes.",
  'Example: Show the 10 newest rows of that table',
  'Return only the message text, or nothing when no follow-up is obvious.',
].join('\n')

export const generateNextPrompt = async (data: {
  messages: AppUIMessage[]
  telemetry?: TelemetryOptions
}) => {
  const asked = data.messages.findLast((message) => message.role === 'user')
  const answered = data.messages.at(-1)
  const question = asked ? textFromMessage(asked) : ''
  const answer = answered?.role === 'assistant' ? textFromMessage(answered) : ''
  if (!(question && answer)) {
    return null
  }

  const { text } = await generateText({
    instructions: SUGGESTION_INSTRUCTIONS,
    maxOutputTokens: 48,
    model: models.fast,
    prompt: [section('MESSAGE', question), section('ANSWER', answer)].join(
      '\n\n'
    ),
    telemetry: data.telemetry,
  })

  return text.trim() || null
}
