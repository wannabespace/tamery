import { updateQuery as runUpdateQuery } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const updateQuery = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.query.use'))
  .input(
    type({
      context: `string <= ${AI_QUERY_LIMITS.context}`,
      editor: `string <= ${AI_QUERY_LIMITS.query}`,
      images: type
        .instanceOf(File)
        .narrow(
          (image) =>
            image.type.startsWith('image/') &&
            image.size <= AI_QUERY_LIMITS.imageBytes
        )
        .array()
        .atMostLength(AI_QUERY_LIMITS.images),
      prompt: `string <= ${AI_QUERY_LIMITS.prompt}`,
      query: `string <= ${AI_QUERY_LIMITS.query}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .handler(({ context, input, signal }) =>
    runUpdateQuery({
      connectionType: input.type,
      context: input.context,
      editor: input.editor,
      images: input.images,
      prompt: input.prompt,
      signal,
      query: input.query,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.UpdateQuery,
        userId: context.user.id,
      }),
    })
  )
