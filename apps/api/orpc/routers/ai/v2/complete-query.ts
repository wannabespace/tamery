import { completeSql } from '@tamery/ai/features'
import { AI_SQL_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const completeSQL = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.sql.use'))
  .input(
    type({
      context: `string <= ${AI_SQL_LIMITS.context}`,
      prefix: `string <= ${AI_SQL_LIMITS.sql}`,
      suffix: `string <= ${AI_SQL_LIMITS.sql}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .handler(({ context, input, signal }) => {
    const scope = { feature: AiFeature.CompleteSql, userId: context.user.id }
    return completeSql({
      connectionType: input.type,
      context: input.context,
      onUsage: (modelId, usage) => aiUsage.record(scope, modelId, usage),
      prefix: input.prefix,
      signal,
      suffix: input.suffix,
    })
  })
