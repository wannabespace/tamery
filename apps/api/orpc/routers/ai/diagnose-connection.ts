import { diagnoseConnection as diagnose } from '@tamery/ai/features'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { authMiddleware, orpc } from '~/orpc'

const truncated = (length: number) =>
  type('string').pipe((value) => value.slice(0, length))

export const diagnoseConnection = orpc
  .use(authMiddleware)
  .input(
    type({
      error: truncated(4000),
      hostKind: 'string <= 100',
      options: truncated(2000),
      passwordSet: 'boolean',
      port: 'string <= 10',
      sshEnabled: 'boolean',
      type: type.valueOf(ConnectionType).or('null'),
      userSet: 'boolean',
    })
  )
  .handler(({ context, input: { error, ...settings }, signal }) =>
    diagnose({
      error,
      settings: { ...settings, runtime: context.isDesktop ? 'desktop' : 'web' },
      signal,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.DiagnoseConnection,
        userId: context.user.id,
      }),
    })
  )
