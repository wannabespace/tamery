import { expect, test } from 'bun:test'

import { getHostHint, getHostKind, isInternalHost } from './hosts'

test.each([
  'localhost',
  '0.0.0.0',
  '::',
  '127.0.0.1',
  '10.0.0.5',
  '169.254.169.254',
  'fe80::1',
  'fd00::1',
  'db',
  'db.internal',
  'localhost.',
  '[::1]',
  '::ffff:127.0.0.1',
  '::ffff:7f00:1',
  '[::ffff:a00:5]',
  'db.internal.',
])('%p is internal', (host) => {
  expect(isInternalHost(host)).toBe(true)
})

test.each([
  'db.acme.io',
  'db.acme.io.',
  '8.8.8.8',
  '::ffff:808:808',
  '2001:db8::5',
])('%p is public', (host) => {
  expect(isInternalHost(host)).toBe(false)
})

test.each([
  ['localhost.', 'local'],
  ['::ffff:7f00:1', 'local'],
  ['10.0.0.5.', 'private'],
  ['db.abcd.supabase.co.', 'ipv6-only'],
  ['db.acme.io.', 'public'],
] as const)('%p is %p', (host, kind) => {
  expect(getHostKind(host)).toBe(kind)
})

test('a root dot keeps the provider', () => {
  expect(getHostHint('x.pooler.supabase.com.')?.label).toBe(
    getHostHint('x.pooler.supabase.com')?.label
  )
})
