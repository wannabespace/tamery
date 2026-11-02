import { timingSafeEqual } from 'node:crypto'

/** `timingSafeEqual` throws on a length mismatch, which an attacker picks. */
export const safeEqual = (received: string, expected: string) => {
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
