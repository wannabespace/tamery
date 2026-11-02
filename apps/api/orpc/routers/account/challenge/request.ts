import { challenge } from '@tamery/shared/challenge'
import { formatDeviceLabel } from '@tamery/shared/device-label'
import { type } from 'arktype'

import { locateIp } from '~/lib/geo-ip'
import { accountMiddleware, orpc } from '~/orpc'

import { codeChallengeRedis } from './code-challenge'

/** What the confirm page shows of the device asking to sign in, so a link someone else started reads as theirs. */
export const request = orpc
  .use(accountMiddleware)
  .input(type({ codeChallenge: 'string' }))
  .handler(async ({ input }) => {
    const found = await codeChallengeRedis.getRequest(input.codeChallenge)

    return (
      found && {
        code: challenge.getUserCode(input.codeChallenge),
        device: found.userAgent ? formatDeviceLabel(found.userAgent) : null,
        location: found.ipAddress ? locateIp(found.ipAddress) : null,
      }
    )
  })
