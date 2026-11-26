import { silently } from '@tamery/shared/utils'

import type { HostKeyStatus } from './known-hosts'
import { knownHosts } from './known-hosts'

export type ConfirmHostKey = (prompt: {
  fingerprint: string
  host: string
  keyType: string
}) => Promise<boolean>

const asking = new Map<string, Promise<boolean>>()
// A read-only known_hosts (a home-manager symlink) keeps no trusted key, so without this a tunnel reopening mid-query would prompt again.
const trustedThisRun = new Set<string>()

const getId = (name: string, key: Buffer) => `${name} ${key.toString('base64')}`

export const hostKeyTrust = {
  /** A key trusted this run only stands in for a missing entry: a changed or revoked one in known_hosts still refuses it. */
  check: (known: string, name: string, key: Buffer): HostKeyStatus => {
    const status = knownHosts.check(known, name, key)
    return status === 'unknown' && trustedThisRun.has(getId(name, key))
      ? 'known'
      : status
  },
  /** Concurrent connects to one host share one prompt. */
  confirm: (
    name: string,
    key: Buffer,
    {
      confirm,
      hashed,
      isLive,
    }: { confirm: ConfirmHostKey; hashed: boolean; isLive: () => boolean }
  ) => {
    const id = getId(name, key)
    const pending = asking.get(id)
    if (pending) {
      return pending
    }
    const trusted = (async () => {
      try {
        const confirmed = await confirm({
          host: name,
          ...knownHosts.describe(key),
        })
        if (confirmed && isLive()) {
          trustedThisRun.add(id)
          // A failed write only costs the next run's prompt, like OpenSSH: the user approved this connection.
          await silently(() => knownHosts.trust(name, key, { hashed }))
        }
        return confirmed
      } finally {
        asking.delete(id)
      }
    })()
    asking.set(id, trusted)
    return trusted
  },
}
