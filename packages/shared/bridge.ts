import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { type } from 'arktype'

import { PORTS } from './ports'

/** Bumped only by a change an older bridge cannot serve; the app refuses a bridge below `MIN_BRIDGE_PROTOCOL`. */
export const BRIDGE_PROTOCOL = 1
export const MIN_BRIDGE_PROTOCOL = 1

/** `localhost` may resolve to `::1`, where any other process can listen. */
export const BRIDGE_URL = `http://127.0.0.1:${PORTS.BRIDGE}`

export const BRIDGE_PAIR_PATH = '/settings/bridge'
export const BRIDGE_RPC_PATH = '/rpc'

/** `'all'` when the bridge holds no string at all, as for **Metadata only**. */
export const bridgeNeedsSecrets = type({
  connectionId: 'string',
  fields: "string[] | 'all'",
})

/**
 * The browser proves nothing and the bridge proves it holds the browser's key, so a process that took the port after the
 * bridge stopped never sees the secret. Both sides key the HMAC with the secret's hash, the only form the bridge keeps.
 */
export const bridgeKey = {
  hash: (secret: string) => bytesToHex(sha256(utf8ToBytes(secret))),
  nonce: () => bytesToHex(randomBytes(32)),
  proof: (hash: string, nonce: string) =>
    bytesToHex(hmac(sha256, utf8ToBytes(hash), utf8ToBytes(nonce))),
}
