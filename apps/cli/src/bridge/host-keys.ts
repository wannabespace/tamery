import { log } from '@clack/prompts'
import { connectionParts } from '@tamery/connection/connection-parts'
import type { ConfirmHostKey } from '@tamery/connection/ssh/host-key'
import { HOST_KEY_REFUSALS } from '@tamery/connection/ssh/host-key'
import { tunnelError } from '@tamery/connection/ssh/params'
import type { bridgeHostKey } from '@tamery/shared/bridge'
import { toError } from '@tamery/shared/utils'

import { paint } from '../paint'
import { printable } from './printable'

type HostKey = typeof bridgeHostKey.infer

const UNTRUSTED = tunnelError(HOST_KEY_REFUSALS.unknown).message

const getTunnel = (connectionString: string) =>
  JSON.stringify(connectionParts.parse(connectionString).ssh)

const getId = ({ fingerprint, host }: HostKey) => `${host} ${fingerprint}`

// By tunnel: queries through one share its session, so only the first is asked.
const refused = new Map<string, HostKey>()
const trusted = new Set<string>()

export const hostKeys = {
  confirm:
    (connectionString: string): ConfirmHostKey =>
    (hostKey) => {
      if (trusted.delete(getId(hostKey))) {
        return Promise.resolve(true)
      }
      refused.set(getTunnel(connectionString), hostKey)
      log.info(
        `Asked the browser whether to trust the SSH host ${paint.bold(printable(hostKey.host))}.`
      )
      return Promise.resolve(false)
    },
  getRefused: (connectionString: string, error: unknown) =>
    toError(error).message === UNTRUSTED
      ? (refused.get(getTunnel(connectionString)) ?? null)
      : null,
  /** Only a key a tunnel presented: a browser cannot plant trust in one ahead of its host. */
  trust: (hostKey: HostKey) => {
    for (const [tunnel, asked] of refused) {
      if (getId(asked) === getId(hostKey)) {
        refused.delete(tunnel)
        trusted.add(getId(hostKey))
      }
    }
  },
}
