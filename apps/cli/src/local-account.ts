import { machineIdentity } from './machine/identity'
import { pairings } from './machine/pairings'
import type { VaultAccount } from './vault'
import { vault } from './vault'

/** What this computer keeps for its account: saved secrets, paired browsers and the id the account lists it under. */
export const localAccount = {
  reset: async () => {
    await vault.reset()
    pairings.reset()
    machineIdentity.reset()
  },
  /** Another account never inherits what the previous one kept. */
  set: async (account: VaultAccount) => {
    const previous = await vault.account()
    if (previous && previous.id !== account.id) {
      await localAccount.reset()
    }
    await vault.setAccount(account)
  },
}
