import { diagnoseConnection as diagnose } from '@tamery/ai/features'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { type } from 'arktype'

import { aiKey } from '~/lib/ai-key'
import { aiUsage } from '~/lib/ai-usage'
import { authMiddleware, orpc } from '~/orpc'

/** The client already swaps secrets for placeholders; this keeps any client from sending one on to the model provider. */
const redacted = (length: number) =>
  type('string').pipe((value) => redactSecrets(value).slice(0, length))

export const diagnoseConnection = orpc
  .use(authMiddleware)
  .input(
    type({
      error: redacted(4000),
      hostKind: 'string <= 100',
      options: redacted(2000),
      passwordSet: 'boolean',
      port: 'string <= 10',
      sshEnabled: 'boolean',
      type: type.valueOf(ConnectionType).or('null'),
      userSet: 'boolean',
    })
  )
  .handler(async ({ context, input: { error, ...settings }, signal }) => {
    const key = await aiKey.get(context.user.id)
    return diagnose({
      error,
      key,
      settings: { ...settings, runtime: context.isDesktop ? 'desktop' : 'web' },
      signal,
      telemetry: key
        ? undefined
        : aiUsage.telemetry({
            feature: AiFeature.DiagnoseConnection,
            userId: context.user.id,
          }),
    })
  })
