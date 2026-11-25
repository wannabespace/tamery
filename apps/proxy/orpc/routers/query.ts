import { createQueryRouter } from '@tamery/query-proxy'

import { createApiClient } from '~/api-client'
import { authenticate, orpc, originMiddleware } from '~/orpc'
import { assertReachable } from '~/public-host'

export const query = createQueryRouter(orpc.use(originMiddleware), {
  connection: async (input, context) => {
    if ('connectionString' in input) {
      const ownerId = await authenticate(context)
      await assertReachable(input.connectionString)
      return { connectionString: input.connectionString, ownerId }
    }

    // No `authenticate` here: the API refuses this call without a valid session, and the user it answers with is the owner.
    const { connectionString, userId } = await createApiClient({
      authorization: context.headers.get('authorization'),
      cookie: context.headers.get('cookie'),
    }).internal.proxy.resolveConnectionString(
      'connectionId' in input
        ? { connectionId: input.connectionId }
        : { resourceId: input.resourceId }
    )
    context.addLogData({ userId })
    await assertReachable(connectionString)
    return { connectionString, ownerId: userId }
  },
  owner: authenticate,
})
