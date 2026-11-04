import { redis } from '~/lib/redis'

const ATTESTATION_TTL_S = 2 * 60

/** Keyed by the bridge's origin too: a relay at another URL would get a nonce the real bridge attested under its own. */
const key = (nonce: string, origin: string) =>
  `bridge-attestation:${origin}:${nonce}`

export const bridgeAttestation = {
  /** `NX`: whoever learns a live nonce must not overwrite whom it vouches for. */
  set: async (nonce: string, origin: string, userId: string) => {
    await redis.set(key(nonce, origin), userId, {
      condition: 'NX',
      expiration: { type: 'EX', value: ATTESTATION_TTL_S },
    })
  },
  take: (nonce: string, origin: string) => redis.getDel(key(nonce, origin)),
}
