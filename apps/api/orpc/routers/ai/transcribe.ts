import { transcribe as runTranscribe } from '@tamery/ai/features'
import { DICTATION } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { CHAT_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

const WAV_HEADER_BYTES = 44
const MAX_AUDIO_BYTES =
  WAV_HEADER_BYTES + DICTATION.sampleRate * 2 * DICTATION.seconds

export const transcribe = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      audio: type
        .instanceOf(File)
        .narrow(
          (audio) => audio.type === 'audio/wav' && audio.size <= MAX_AUDIO_BYTES
        ),
    })
  )
  .errors({
    TOO_MANY_REQUESTS: { message: CHAT_BUDGET_SPENT_MESSAGE },
  })
  .handler(async ({ context, errors, input, signal }) => {
    if (!(await credits.canChat(context.user.id))) {
      throw errors.TOO_MANY_REQUESTS()
    }
    return runTranscribe({
      audio: input.audio,
      signal,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.Dictation,
        userId: context.user.id,
      }),
    })
  })
