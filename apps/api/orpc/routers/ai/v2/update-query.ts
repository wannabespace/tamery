import { updateSql } from '@tamery/ai/features'
import { AI_SQL_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const updateSQL = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.sql.use'))
  .input(
    type({
      context: `string <= ${AI_SQL_LIMITS.context}`,
      editor: `string <= ${AI_SQL_LIMITS.sql}`,
      images: type
        .instanceOf(File)
        .narrow(
          (image) =>
            image.type.startsWith('image/') &&
            image.size <= AI_SQL_LIMITS.imageBytes
        )
        .array()
        .atMostLength(AI_SQL_LIMITS.images),
      prompt: `string <= ${AI_SQL_LIMITS.prompt}`,
      sql: `string <= ${AI_SQL_LIMITS.sql}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .handler(({ context, input, signal }) =>
    updateSql({
      connectionType: input.type,
      context: input.context,
      editor: input.editor,
      images: input.images,
      prompt: input.prompt,
      signal,
      sql: input.sql,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.UpdateSql,
        userId: context.user.id,
      }),
    })
  )
