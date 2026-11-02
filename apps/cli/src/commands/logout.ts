import { log } from '@clack/prompts'
import { silently } from '@tamery/shared/utils'
import { Result } from 'better-result'

import { account } from '../api'
import { pairings } from '../bridge/pairings'
import { paint } from '../paint'
import { vault } from '../vault'

export const logout = async () => {
  // Best effort: logout is how a vault whose key is gone or locked gets reset.
  const saved = await Result.tryPromise(() => vault.account())
  const current = saved.unwrapOr(null)
  if (current) {
    await silently(() => account.signOut(current.token))
  }
  await vault.reset()
  pairings.reset()
  log.success(
    current
      ? `Signed out of ${paint.bold(current.email)}. Saved secrets and paired browsers are gone.`
      : 'Not signed in. Saved secrets and paired browsers are gone.'
  )
}
