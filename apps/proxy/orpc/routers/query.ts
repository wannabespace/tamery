import { createQueryRouter } from '@tamery/query-proxy'

import { authenticate, orpc, originMiddleware, resolveConnection } from '~/orpc'
import { assertReachable } from '~/public-host'

export const query = createQueryRouter(orpc.use(originMiddleware), {
  connection: async (input, context) => {
    if ('connectionString' in input) {
      const ownerId = await authenticate(context)
      await assertReachable(input.connectionString)
      return { connectionString: input.connectionString, ownerId }
    }

    const { connectionString, userId } = await resolveConnection(
      context,
      'connectionId' in input
        ? { connectionId: input.connectionId }
        : { resourceId: input.resourceId }
    )
    await assertReachable(connectionString)
    return { connectionString, ownerId: userId }
  },
  owner: authenticate,
})
