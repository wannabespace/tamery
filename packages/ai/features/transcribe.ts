import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import { models } from '../models/list'

const TRANSCRIBE_INSTRUCTIONS = [
  'Transcribe the recording word for word, in the language it is spoken in, with punctuation.',
  'The speaker is writing a message to an assistant that works with databases: keep table, column and SQL names as spoken.',
  'Return only the transcript. For silence or noise, return nothing.',
].join('\n')

export const transcribe = async (data: {
  audio: File
  signal?: AbortSignal
  telemetry?: TelemetryOptions
}) => {
  const { text } = await generateText({
    abortSignal: data.signal,
    instructions: TRANSCRIBE_INSTRUCTIONS,
    model: models.transcribe,
    prompt: [
      {
        content: [
          {
            data: new Uint8Array(await data.audio.arrayBuffer()),
            mediaType: 'audio/wav',
            type: 'file',
          },
        ],
        role: 'user',
      },
    ],
    telemetry: data.telemetry,
  })
  return text.trim()
}
