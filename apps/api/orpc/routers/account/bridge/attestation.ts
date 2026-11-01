import { redis } from '~/lib/redis'

const ATTESTATION_TTL_S = 2 * 60

const key = (nonce: string) => `bridge-attestation:${nonce}`

/** A bridge vouches for the account it is signed in to, which the pairing browser then checks against its own. */
export const bridgeAttestation = {
  set: async (nonce: string, userId: string) => {
    await redis.setEx(key(nonce), ATTESTATION_TTL_S, userId)
  },
  take: (nonce: string) => redis.getDel(key(nonce)),
}
