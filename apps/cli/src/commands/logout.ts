import { log } from '@clack/prompts'
import { silently } from '@tamery/shared/utils'

import { account } from '../api'
import { pairings } from '../bridge/pairings'
import { paint } from '../paint'
import { vault } from '../vault'

export const logout = async () => {
  const current = await vault.account()
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
