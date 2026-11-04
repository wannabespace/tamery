import { formatDeviceLabel } from '@tamery/shared/device-label'
import { type } from 'arktype'

import { locateIp } from '~/lib/geo-ip'
import { accountMiddleware, orpc } from '~/orpc'

import { challengeDeviceRedis } from './code-challenge'

export const device = orpc
  .use(accountMiddleware)
  .input(type({ codeChallenge: 'string' }))
  .handler(async ({ input }) => {
    const found = await challengeDeviceRedis.get(input.codeChallenge)

    return (
      found && {
        label: found.userAgent ? formatDeviceLabel(found.userAgent) : null,
        location: found.ipAddress ? locateIp(found.ipAddress) : null,
      }
    )
  })
