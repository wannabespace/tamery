import { type } from 'arktype'

import { accountMiddleware, orpc } from '~/orpc'

import {
  challengeDeviceRedis,
  codeChallengePublisher,
  codeChallengeRedis,
} from './code-challenge'

const NEW_USER_WINDOW_MS = 10 * 60 * 1000

export const publish = orpc
  .use(accountMiddleware)
  .input(type({ codeChallenge: 'string' }))
  .errors({
    NOT_FOUND: {
      message:
        'This sign-in request expired or was never started. Start signing in again on your device.',
    },
  })
  .handler(async ({ context, errors, input }) => {
    // Only a device that is waiting on its own `listen` may be handed a session, never a challenge someone only linked to.
    if (!(await challengeDeviceRedis.get(input.codeChallenge))) {
      throw errors.NOT_FOUND()
    }

    await codeChallengeRedis.set(input.codeChallenge, {
      newUser:
        Date.now() - context.user.createdAt.getTime() < NEW_USER_WINDOW_MS,
      userId: context.user.id,
    })
    codeChallengePublisher.publish(input.codeChallenge, { ready: true })
  })
