import { CLIENT_IP_HEADER } from '@tamery/shared/constants'
import { type } from 'arktype'

import { orpc } from '~/orpc'

import {
  challengeDeviceRedis,
  codeChallengePublisher,
  codeChallengeRedis,
} from './code-challenge'

export const listen = orpc
  .input(
    type({
      codeChallenge: 'string',
    })
  )
  .handler(async function* listen({ context: { headers }, input, signal }) {
    const events = codeChallengePublisher.subscribe(input.codeChallenge, {
      signal,
    })

    await challengeDeviceRedis.register(input.codeChallenge, {
      ipAddress: headers.get(CLIENT_IP_HEADER),
      userAgent: headers.get('User-Agent'),
    })

    yield { ready: !!(await codeChallengeRedis.get(input.codeChallenge)) }
    yield* events
  })
