import { log } from '@clack/prompts'
import { silently } from '@tamery/shared/utils'
import { Result } from 'better-result'

import { analytics } from '../analytics'
import { account, api } from '../api'
import { localAccount } from '../local-account'
import { machineIdentity } from '../machine/identity'
import { paint } from '../paint'
import { vault } from '../vault'

export const logout = async () => {
  // Best effort: logout is how a vault whose key is gone or locked gets reset.
  const saved = await Result.tryPromise(() => vault.account())
  const current = saved.unwrapOr(null)
  if (current) {
    await analytics.capture('signed_out', {})
    const id = machineIdentity.saved()
    if (id) {
      await silently(() => api.machines.remove({ id }))
    }
    await silently(() => account.signOut(current.token))
  }
  await localAccount.reset()
  log.success(
    current
      ? `Signed out of ${paint.bold(current.email)}. Saved secrets and paired browsers are gone.`
      : 'Not signed in. Saved secrets and paired browsers are gone.'
  )
}
