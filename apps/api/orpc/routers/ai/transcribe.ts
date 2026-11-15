import { transcribe as runTranscribe } from '@tamery/ai/features'
import { DICTATION } from '@tamery/ai/limits'
import { canTranscribe } from '@tamery/ai/models'
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
    })
  )
  .errors({
    BAD_REQUEST: { message: 'The recording is not a WAV file.' },
    NOT_SUPPORTED: {
      message:
        "Dictation needs a Google or OpenRouter key: your AI provider's models take no audio.",
    },
    TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE },
  })
  .handler(async ({ context, errors, input, signal }) => {
    if (!(await isWav(input.audio))) {
      throw errors.BAD_REQUEST()
    }
    const { key, telemetry } = await payForAi(
      context.user.id,
      errors.TOO_MANY_REQUESTS
    )
    if (!canTranscribe(key)) {
      throw errors.NOT_SUPPORTED()
    }
    return runTranscribe({
      audio: input.audio,
      key,
      signal,
      telemetry: telemetry({
        feature: AiFeature.Dictation,
        userId: context.user.id,
      }),
    })
  })
