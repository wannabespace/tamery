import { fixQuery as runFixQuery } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { orpc, paidAiMiddleware, permissionsMiddleware, permix } from '~/orpc'

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
  .use(paidAiMiddleware)
  .handler(({ context, input, signal }) =>
    runFixQuery({
      connectionType: input.type,
      context: input.context,
      editor: input.editor,
      error: input.error,
      signal,
      query: input.query,
      telemetry: context.payer.telemetry({
        feature: AiFeature.FixQuery,
        userId: context.user.id,
      }),
    })
  )
