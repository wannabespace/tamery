import {
  fixQuery as runFixQuery,
  updateQuery as runUpdateQuery,
} from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

// Shipped desktop builds call ai.completeSQL / ai.fixSQL / ai.updateSQL, the last two with a `sql` field, so these keep
// the old paths working after the rename to *Query (and `sql` → `query`). Delete once those builds are no longer in use.

export { completeQuery as completeSQL } from './complete-query'

export const fixSQL = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.query.use'))
  .input(
    type({
      context: `string <= ${AI_QUERY_LIMITS.context}`,
      editor: `string <= ${AI_QUERY_LIMITS.query}`,
      error: `string <= ${AI_QUERY_LIMITS.error}`,
      sql: `string <= ${AI_QUERY_LIMITS.query}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .handler(({ context, input, signal }) =>
    runFixQuery({
      connectionType: input.type,
      context: input.context,
      editor: input.editor,
      error: input.error,
      query: input.sql,
      signal,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.FixQuery,
        userId: context.user.id,
      }),
    })
  )

export const updateSQL = orpc
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
      sql: `string <= ${AI_QUERY_LIMITS.query}`,
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
      query: input.sql,
      signal,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.UpdateQuery,
        userId: context.user.id,
      }),
    })
  )
