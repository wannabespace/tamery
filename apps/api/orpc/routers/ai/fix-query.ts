import { fixQuery as runFixQuery } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const fixQuery = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.query.use'))
  .input(
    type({
      context: `string <= ${AI_QUERY_LIMITS.context}`,
      editor: `string <= ${AI_QUERY_LIMITS.query}`,
      error: `string <= ${AI_QUERY_LIMITS.error}`,
      query: `string <= ${AI_QUERY_LIMITS.query}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .errors({
    TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE },
  })
  .handler(async ({ context, errors, input, signal }) => {
    const { key, telemetry } = await payForAi(
      context.user.id,
      errors.TOO_MANY_REQUESTS
    )
    return runFixQuery({
      connectionType: input.type,
      context: input.context,
      editor: input.editor,
      error: input.error,
      signal,
      query: input.query,
      key,
      telemetry: telemetry({
        feature: AiFeature.FixQuery,
        userId: context.user.id,
      }),
    })
  })
