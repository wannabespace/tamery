import { expect, test } from 'bun:test'
import { once } from 'node:events'

import { assertReachable, guardedForwarding } from './public-host'

test.each([
  'postgres://u:p@127.0.0.1/db',
  'postgres://u:p@localhost/db',
  'postgres://u:p@0.0.0.0/db',
  'postgres://u:p@10.1.2.3/db',
  'postgres://u:p@172.16.0.1/db',
  'postgres://u:p@192.168.1.1/db',
  'postgres://u:p@169.254.169.254/db',
  'postgres://u:p@100.100.100.200/db',
  'postgres://u:p@198.18.0.1/db',
  'postgres://u:p@224.0.0.1/db',
  'postgres://u:p@255.255.255.255/db',
  'postgres://u:p@[64:ff9b::7f00:1]/db',
  'postgres://u:p@[2002:7f00:1::]/db',
  'postgres://u:p@[::]/db',
  'postgres://u:p@[::1]/db',
  'postgres://u:p@[fe80::1]/db',
  'postgres://u:p@[fd00::1]/db',
  'postgres://u:p@[::ffff:127.0.0.1]/db',
  'postgres:///db',
  'sqlite:///etc/hosts',
])('refuses %p', async (connectionString) => {
  await expect(assertReachable(connectionString)).rejects.toThrow(
    'only public hosts'
  )
})

test.each(['postgres://u:p@8.8.8.8/db', 'postgres://u:p@[2001:4860::8888]/db'])(
  'allows %p',
  async (connectionString) => {
    await expect(assertReachable(connectionString)).resolves.toBeUndefined()
  }
)

test.each([
  'postgres://u:p@8.8.8.8/db?sslrootcert=/etc/passwd',
  'mysql://u:p@8.8.8.8/db?sslCA=/etc/passwd',
])('refuses a file on its own disk in %p', async (connectionString) => {
  await expect(assertReachable(connectionString)).rejects.toThrow(
    'cannot read certificate files'
  )
})

test.each([
  'mongodb://8.8.8.8/db?authMechanism=MONGODB-AWS',
  'mongodb://8.8.8.8/db?authmechanism=mongodb-oidc&authMechanismProperties=ENVIRONMENT:gcp',
])(
  'refuses credentials from its own machine in %p',
  async (connectionString) => {
    await expect(assertReachable(connectionString)).rejects.toThrow(
      'AWS, OIDC or Kerberos'
    )
  }
)

test('a driver socket refuses a host that resolves to a private address', async () => {
  const forwarding = await guardedForwarding('postgres://u:p@localhost/db')
  const [error] = await once(forwarding.socket(), 'error')
  expect(error).toBeInstanceOf(Error)
  expect(String(error)).toContain('only public hosts')
})
