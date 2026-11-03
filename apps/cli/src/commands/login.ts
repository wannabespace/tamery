import { log } from '@clack/prompts'

import { paint } from '../paint'
import { getAccount } from '../sign-in'
import { vault } from '../vault'

export const login = async () => {
  const saved = await vault.account()
  const current = await getAccount()
  if (current.token === saved?.token) {
    log.info(
      `Signed in as ${paint.bold(current.email)}. Run ${paint.accent('tamery logout')} to switch accounts.`
    )
  }
}
