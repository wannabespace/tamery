import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import type { AppUIMessage } from '../message'
import { textFromMessage } from '../message'
import type { AiKey } from '../models/own-key'
import { modelsFor } from '../models/own-key'
import { section } from './prompt'

const SUGGESTION_MAX_LENGTH = 60

const SUGGESTION_INSTRUCTIONS = [
  "Guess the user's next message in a chat with a database assistant, from their last message under MESSAGE and the assistant's answer under ANSWER.",
  'Write it as the user would type it to the assistant: a short request that takes the work one natural step further, never a reply to the answer and never a question to the user.',
  'Never a request to run, approve, apply, save or retry a change or its draft: the user decides those with buttons on the change, and a change they declined stays declined, so after a decline suggest a different step or nothing. Never a request for something that does not exist yet, such as a link nobody created, or for what the assistant cannot do here, such as opening a chat or acting in another connection.',
  'Never echo a question the answer asked the user ("What columns would you prefer"): when the answer waits for their choice, suggest nothing.',
  `Use the user's language. At most ${SUGGESTION_MAX_LENGTH} characters, sentence case, no trailing punctuation, no quotes.`,
  'Example: Show the 10 newest rows of that table',
  'Return only the message text, or nothing when no follow-up is obvious.',
].join('\n')

export const generateNextPrompt = async (data: {
  messages: AppUIMessage[]
  key?: AiKey | null
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
    model: modelsFor(data.key).fast,
    prompt: [section('MESSAGE', question), section('ANSWER', answer)].join(
      '\n\n'
    ),
    telemetry: data.telemetry,
  })

  const suggestion = text.trim()
  // A model with nothing to offer sometimes explains that at length instead of returning nothing.
  return suggestion && suggestion.length <= SUGGESTION_MAX_LENGTH
    ? suggestion
    : null
}
