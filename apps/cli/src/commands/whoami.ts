import { log } from '@clack/prompts'

import { paint } from '../paint'
import { vault } from '../vault'

export const whoami = async () => {
  const account = await vault.account()
  if (!account) {
    throw new Error(`Not signed in. Run ${paint.accent('tamery login')}.`)
  }
  log.info(`Signed in as ${paint.bold(account.email)}`)
}
