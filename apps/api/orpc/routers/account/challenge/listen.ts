import { CLIENT_IP_HEADER } from '@tamery/shared/constants'
import { sleep } from '@tamery/shared/utils'
import { type } from 'arktype'

import { orpc } from '~/orpc'

import {
  TTL_S,
  challengeDeviceRedis,
  codeChallengeRedis,
} from './code-challenge'

const POLL_MS = 1000

export const listen = orpc
  .input(
    type({
      codeChallenge: 'string',
    })
  )
  .handler(async function* listen({ context: { headers }, input, signal }) {
    await challengeDeviceRedis.register(input.codeChallenge, {
      ipAddress: headers.get(CLIENT_IP_HEADER),
      userAgent: headers.get('User-Agent'),
    })

    const isReady = async () =>
      !!(await codeChallengeRedis.get(input.codeChallenge))

    const expiresAt = Date.now() + TTL_S * 1000
    let ready = await isReady()
    yield { ready }

    while (!ready && Date.now() < expiresAt) {
      // oxlint-disable-next-line no-await-in-loop
      await sleep(POLL_MS, signal)
      if (signal?.aborted) {
        return
      }
      // oxlint-disable-next-line no-await-in-loop
      ready = await isReady()
      if (ready) {
        yield { ready }
      }
    }
  })
