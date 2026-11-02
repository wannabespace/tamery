import { env } from '~/env'
import { safeEqual } from '~/lib/safe-equal'
import { orpc } from '~/orpc'

export const proxySecretMiddleware = orpc
  .errors({
    FORBIDDEN: { message: 'Invalid proxy token' },
  })
  .middleware(({ context, errors, next }) => {
    if (
      !safeEqual(
        context.headers.get('x-proxy-token') ?? '',
        env.PROXY_SHARED_SECRET
      )
    ) {
      throw errors.FORBIDDEN()
    }

    return next()
  })
