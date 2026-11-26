import { expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'
import type { DiagnosisRequest } from '@tamery/connection/diagnosis-request'
import { ConnectionType } from '@tamery/shared/enums/connection-type'

import type { Context } from '../../context'

const sent: unknown[] = []

mock.module('@tamery/ai/features', () => ({
  diagnoseConnection: ({ error, settings }: Record<string, unknown>) => {
    sent.push({ error, settings })
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

const SETTINGS = {
  hostKind: 'public host',
  passwordSet: true,
  port: '5432',
  sshEnabled: true,
  type: ConnectionType.Postgres,
  userSet: true,
}

const diagnosed = async (
  request: Pick<DiagnosisRequest, 'error'> & Partial<DiagnosisRequest>
) => {
  sent.length = 0
  await call(
    diagnoseConnection,
    {
      ...SETTINGS,
      options: 'sslmode=require&application_name=%3Credacted%3E',
      ...request,
    },
    { context: {} as Context }
  )
  return sent
}

// Each `error` is what the v0.99.6 renderer's getDiagnosisRequest wrote for the message and form the comment names.
test.each([
  [
    "Can't reach the SSH host at bastion.corp.io: ECONNREFUSED, SSH host alias `host`",
    "SSH tunnel: Can't reach the SSH <ssh-<ssh-host>> at bastion.corp.io: ECONNREFUSED",
    'SSH tunnel: SSH connection failed',
  ],
  [
    "Can't reach the SSH host at bastion.corp.io: ECONNREFUSED, SSH host alias `SSH`",
    "<ssh-host> tunnel: Can't reach the <ssh-host> host at bastion.corp.io: ECONNREFUSED",
    'SSH tunnel: SSH connection failed',
  ],
  [
    'Timed out connecting to the SSH host at bastion.corp.io, SSH host alias `at`, user `me`',
    'SSH tunnel: Ti<user>d out connecting to the SSH host <ssh-host> bastion.corp.io',
    'SSH tunnel: SSH connection failed',
  ],
  [
    'an ssh2 failure naming the host',
    'SSH tunnel: SSH connection failed: Disconnected by bastion.corp.io',
    'SSH tunnel: SSH connection failed',
  ],
  [
    'a ~/.ssh/config parse error',
    'Unexpected line break at bastion.corp.io',
    "SSH tunnel: ~/.ssh/config couldn't be parsed",
  ],
  [
    "the SSH host's description of a refused forward",
    '(SSH) Channel open failure: Connection refused by bastion.corp.io',
    '(SSH) Channel open failure',
  ],
  [
    'several containers of the database host, a Docker service',
    'SSH tunnel: Several containers run the service <host>: <database>-<host>-1, staging-<host>-1. Use the container na<user> as the host.',
    'SSH tunnel: SSH connection failed',
  ],
  [
    'a failed SSH sign-in',
    'SSH tunnel: SSH authentication failed. Check the SSH user and credentials.',
    'SSH tunnel: SSH authentication failed. Check the SSH user and credentials.',
  ],
])(
  'sends an older app’s request for %s without the host',
  async (_, error, forwarded) => {
    expect(await diagnosed({ error })).toEqual([
      {
        error: forwarded,
        settings: {
          ...SETTINGS,
          options: 'sslmode=require',
          runtime: 'desktop',
        },
      },
    ])
  }
)

test('keeps a driver error but no setting that names anything', async () => {
  expect(
    await diagnosed({
      error: 'password authentication failed for user "<user>"',
      hostKind: 'public host bastion.corp.io',
      options: 'sslmode=require&prod.internal=%3Credacted%3E',
      port: '22 bastion',
      sshEnabled: false,
    })
  ).toEqual([
    {
      error: 'password authentication failed for user "<user>"',
      settings: {
        ...SETTINGS,
        hostKind: '',
        options: 'sslmode=require',
        port: '',
        runtime: 'desktop',
        sshEnabled: false,
      },
    },
  ])
})
