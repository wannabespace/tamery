import { log } from '@clack/prompts'

import { paint } from '../paint'
import { signIn } from '../sign-in'
import { vault } from '../vault'

export const login = async () => {
  const current = await vault.account()
  if (current) {
    return log.info(
      `Signed in as ${paint.bold(current.email)}. Run ${paint.accent('tamery logout')} to switch accounts.`
    )
  }
  await signIn()
}
