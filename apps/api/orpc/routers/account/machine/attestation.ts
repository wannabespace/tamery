import { redis } from '~/lib/redis'

const ATTESTATION_TTL_S = 2 * 60

/** Keyed by the machine's origin too: a relay at another URL would get a nonce the real machine attested under its own. */
const key = (nonce: string, origin: string) =>
  `machine-attestation:${origin}:${nonce}`

export const machineAttestation = {
  /** `NX`: whoever learns a live nonce must not overwrite whom it vouches for. */
  set: async (nonce: string, origin: string, userId: string) => {
    await redis.set(key(nonce, origin), userId, {
      condition: 'NX',
      expiration: { type: 'EX', value: ATTESTATION_TTL_S },
    })
  },
  take: (nonce: string, origin: string) => redis.getDel(key(nonce, origin)),
}
