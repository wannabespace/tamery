import process from 'node:process'

import { kms } from '../lib/kms'

const input = await Bun.stdin.text()
const secret = input.trim()

if (!secret) {
  throw new Error('Pipe the plaintext secret to wrap via stdin')
}

process.stdout.write(`${await kms.wrap(secret)}\n`)
