import { expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'

import type { Context } from '../../context'

const sent: string[] = []

mock.module('@tamery/ai/features', () => ({
  diagnoseConnection: ({ error }: { error: string }) => {
    sent.push(error)
    return Promise.resolve({})
  },
}))
mock.module('@orpc/ratelimit', () => ({
  ratelimit: () => os.middleware(({ next }) => next()),
}))
mock.module('~/lib/redis', () => ({ redis: {} }))
mock.module('~/lib/ai-usage', () => ({ aiUsage: { telemetry: () => ({}) } }))
const orpc = os.$context<Context>()
mock.module('~/orpc', () => ({
  authMiddleware: orpc.middleware(({ next }) =>
    next({ context: { isDesktop: true, user: { id: 'user' } } })
  ),
  callerRateLimitKey: () => 'user',
  orpc,
}))

const { diagnoseConnection } = await import('./diagnose-connection')

test.each([
  [
    "SSH tunnel: Can't reach the SSH host at [2001:db8::5%eth0]:2222: ECONNREFUSED",
    "SSH tunnel: Can't reach the SSH host at <ssh-host>: ECONNREFUSED",
  ],
  [
    'SSH tunnel: Timed out connecting to the SSH host at <ssh-host>.corp.io',
    'SSH tunnel: Timed out connecting to the SSH host at <ssh-host>',
  ],
  [
    'SSH tunnel: SSH connection failed: Disconnected by bastion.corp.io',
    'SSH tunnel: SSH connection failed',
  ],
  [
    'Unexpected line break at bastion.corp.io',
    "SSH tunnel: ~/.ssh/config couldn't be parsed",
  ],
  [
    'SSH tunnel: Timed out reaching the SSH host',
    'SSH tunnel: Timed out reaching the SSH host',
  ],
])('forwards an older app’s %p as %p', async (message, forwarded) => {
  sent.length = 0
  await call(
    diagnoseConnection,
    {
      error: message,
      hostKind: 'private network',
      options: '',
      passwordSet: false,
      port: '5432',
      sshEnabled: true,
      type: null,
      userSet: true,
    },
    { context: {} as Context }
  )
  expect(sent).toEqual([forwarded])
})
