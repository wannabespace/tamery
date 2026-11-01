import { type } from 'arktype'

import { orpc } from '~/orpc'

import { codeChallengePublisher, codeChallengeRedis } from './code-challenge'

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

    await codeChallengeRedis.register(input.codeChallenge, {
      ipAddress: headers.get('x-real-ip'),
      userAgent: headers.get('User-Agent'),
    })

    yield { ready: !!(await codeChallengeRedis.get(input.codeChallenge)) }
    yield* events
  })
