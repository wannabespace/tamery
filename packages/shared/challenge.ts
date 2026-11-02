import { sha256 } from '@noble/hashes/sha2.js'
import { randomBytes } from '@noble/hashes/utils.js'

import { b64UrlEncode } from './base64'

/** No 0/O, 1/I/L: the code is read off one screen and compared with another. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

export const challenge = {
  generateCode: (verifier: string) =>
    b64UrlEncode(sha256(new TextEncoder().encode(verifier))),
  generateVerifier: () => b64UrlEncode(randomBytes(32)),
  getUserCode: (codeChallenge: string) => {
    const code = Array.from(
      sha256(new TextEncoder().encode(codeChallenge)).subarray(0, CODE_LENGTH),
      (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]
    ).join('')
    return `${code.slice(0, 4)}-${code.slice(4)}`
  },
}
