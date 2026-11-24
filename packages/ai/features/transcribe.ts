import type { TelemetryOptions } from 'ai'
import { generateText, transcribe as transcribeAudio } from 'ai'

import type { Dictation } from '../models/own-key'

const TRANSCRIBE_INSTRUCTIONS = [
  'Transcribe the recording word for word, in the language it is spoken in, with punctuation.',
  'The speaker is writing a message to an assistant that works with databases: keep table, column and SQL names as spoken.',
  'Return only the transcript. For silence or noise, return nothing.',
].join('\n')

/** `dictation` comes from `dictationFor`: a speech-to-text model hears the audio alone, a chat model reads it with the instructions. */
export const transcribe = async (data: {
  audio: File
  dictation: Dictation
  signal?: AbortSignal
  telemetry?: TelemetryOptions
}) => {
  const audio = new Uint8Array(await data.audio.arrayBuffer())
  if (data.dictation.kind === 'transcription') {
    const { text } = await transcribeAudio({
      abortSignal: data.signal,
      audio,
      model: data.dictation.model,
      telemetry: data.telemetry,
    })
    return text.trim()
  }
  const { text } = await generateText({
    abortSignal: data.signal,
    instructions: TRANSCRIBE_INSTRUCTIONS,
    model: data.dictation.model,
    prompt: [
      {
        content: [{ data: audio, mediaType: 'audio/wav', type: 'file' }],
        role: 'user',
      },
    ],
    telemetry: data.telemetry,
  })
  return text.trim()
}
