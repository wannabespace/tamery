import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'

import type { Unlocked } from './local-database'
import { NOTHING_UNLOCKED } from './local-database'

// keyring-core's message for an OSStatus it has no name for, which is how a denied or dismissed prompt arrives; a missing item resolves empty instead.
const DENIED = /^Platform failure/u

/** `withheld`: a saved password exists but the user denied it; never set without `account`. */
export const keychainPassword = async ({
  account,
  service,
}: {
  account?: string
  service: string
}): Promise<Unlocked> => {
  if (process.platform !== 'darwin') {
    return NOTHING_UNLOCKED
  }
  const result = await Result.tryPromise(async () => {
    // Loaded on demand: the bridge's single-file binary ships without native modules, so there the import fails and the password stays for the user to type.
    const { AsyncEntry, findCredentialsAsync } =
      await import('@napi-rs/keyring')
    if (account !== undefined) {
      return new AsyncEntry(service, account).getPassword()
    }
    const [credential] = await findCredentialsAsync(service)
    return credential?.password
  })
  return result.match({
    err: ({ cause }) => ({
      password: '',
      withheld: DENIED.test(toError(cause).message),
    }),
    ok: (password) => ({ password: password ?? '', withheld: false }),
  })
}
