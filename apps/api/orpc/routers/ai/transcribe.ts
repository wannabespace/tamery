import { transcribe as runTranscribe } from '@tamery/ai/features'
import { DICTATION } from '@tamery/ai/limits'
import { dictationFor } from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

const WAV_HEADER_BYTES = 44
// A second of slack: the recorder's own stop lands a few milliseconds past the limit.
const MAX_AUDIO_BYTES =
  WAV_HEADER_BYTES + DICTATION.sampleRate * 2 * (DICTATION.seconds + 1)

const isWav = async (audio: File) => {
  const head = new TextDecoder().decode(await audio.slice(0, 12).arrayBuffer())
  return head.startsWith('RIFF') && head.endsWith('WAVE')
}

export const transcribe = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      // The browser's File type does not survive the upload, so the recording is checked by its header in the handler.
      audio: type
        .instanceOf(File)
        .narrow((audio) => audio.size <= MAX_AUDIO_BYTES),
      /** The own keys' dictation model; one their providers do not offer falls back to the default. */
      'model?': 'string',
    })
  )
  .errors({
    BAD_REQUEST: { message: 'The recording is not a WAV file.' },
    NOT_SUPPORTED: {
      message:
        "Dictation needs a Google, OpenAI or OpenRouter key: Anthropic's models take no audio.",
    },
    TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE },
  })
  .handler(async ({ context, errors, input, signal }) => {
    if (!(await isWav(input.audio))) {
      throw errors.BAD_REQUEST()
    }
    const { keys, telemetry } = await payForAi(
      context.user.id,
      errors.TOO_MANY_REQUESTS
    )
    const dictation = dictationFor(keys, input.model ?? null)
    if (!dictation) {
      throw errors.NOT_SUPPORTED()
    }
    return runTranscribe({
      audio: input.audio,
      dictation,
      signal,
      telemetry: telemetry({
        feature: AiFeature.Dictation,
        userId: context.user.id,
      }),
    })
  })
