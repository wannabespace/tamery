import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import type { AiKey } from '../models/own-key'
import { modelsFor } from '../models/own-key'

const TRANSCRIBE_INSTRUCTIONS = [
  'Transcribe the recording word for word, in the language it is spoken in, with punctuation.',
  'The speaker is writing a message to an assistant that works with databases: keep table, column and SQL names as spoken.',
  'Return only the transcript. For silence or noise, return nothing.',
].join('\n')

/** Throws on a key whose provider takes no audio; `modelsFor(key).transcribe` tells beforehand. */
export const transcribe = async (data: {
  audio: File
  key?: AiKey | null
  signal?: AbortSignal
  telemetry?: TelemetryOptions
}) => {
  const model = modelsFor(data.key).transcribe
  if (!model) {
    throw new Error(`${data.key?.provider} takes no audio`)
  }
  const { text } = await generateText({
    abortSignal: data.signal,
    instructions: TRANSCRIBE_INSTRUCTIONS,
    model,
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
