import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { type } from 'arktype'

import { PORTS } from './ports'

/** Bumped only by a change an older machine cannot serve; the app refuses a machine below `MIN_MACHINE_PROTOCOL`. */
export const MACHINE_PROTOCOL = 3
export const MIN_MACHINE_PROTOCOL = 3

/** `localhost` may resolve to `::1`, where any other process can listen. */
export const MACHINE_URL = `http://127.0.0.1:${PORTS.MACHINE}`

/** Installing again updates. The machine names its installer, never a command, so no machine picks what the app shows to run. */
export const MACHINE_INSTALL_COMMANDS = {
  bun: 'bun add -g tamery',
  npm: 'npm i -g tamery',
  pnpm: 'pnpm add -g tamery',
  powershell: 'irm https://tamery.app/cli/install.ps1 | iex',
  shell: 'curl -fsSL https://tamery.app/cli/install.sh | sh',
  yarn: 'yarn global add tamery',
}

export const MACHINE_PAIR_PATH = '/settings/machines'

/** `origin` is the machine's URL as the browser calls it, which both sides name, so a relay elsewhere never matches. */
export const machineAttestationInput = type({
  nonce: 'string.hex == 64',
  origin: 'string.url',
})

export type MachineId = string & { readonly __brand: 'MachineId' }

export const machineIdSchema = type('string').as<MachineId>()

/** `connection_machines.machine_id` for Tamery Cloud, open to everyone: stored rows hold it, so it never changes. */
export const TAMERY_CLOUD = '00000000-0000-0000-0000-000000000000'

export const machineUnconfirmed = type({ connectionId: 'string' })

export const machineHostKey = type({
  fingerprint: 'string',
  host: 'string',
  keyType: 'string',
})

/** Sent when the machine holds no connection string at all, as for **Metadata only**; released machines send this literal. */
export const ALL_SECRET_FIELDS = 'all'

export const machineNeedsSecrets = type({
  connectionId: 'string',
  fields: type('string[]').or(type.unit(ALL_SECRET_FIELDS)),
})

/**
 * The browser proves nothing and the machine proves it holds the browser's key, so a process that took the port after the
 * machine stopped never sees the secret. Both sides key the HMAC with the secret's hash, the only form the machine keeps.
 */
export const machineKey = {
  hash: (secret: string) => bytesToHex(sha256(utf8ToBytes(secret))),
  nonce: () => bytesToHex(randomBytes(32)),
  proof: (hash: string, nonce: string) =>
    bytesToHex(hmac(sha256, utf8ToBytes(hash), utf8ToBytes(nonce))),
}
