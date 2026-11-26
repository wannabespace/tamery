import { expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'
import type { DiagnosisRequest } from '@tamery/connection/diagnosis-request'

import type { Context } from '../../context'
import { RELEASED_REQUESTS as released } from './released-requests'

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

const diagnosed = async (request: DiagnosisRequest) => {
  sent.length = 0
  await call(diagnoseConnection, request, { context: {} as Context })
  return sent
}

const OPTIONS_SENT: Record<string, string> = {
  'encrypt=true&appname=%3Credacted%3E': 'encrypt=true',
  'sslmode=require&application_name=%3Credacted%3E': 'sslmode=require',
}

const FORWARDED: Record<keyof typeof released, string> = {
  'a Match without its value': "SSH tunnel: ~/.ssh/config couldn't be parsed",
  'a failed SSH sign-in':
    'SSH tunnel: SSH authentication failed. Check the SSH user and credentials.',
  'a malformed HostName, database user line':
    "SSH tunnel: ~/.ssh/config couldn't be parsed",
  'a missing database named database':
    '<<database>> "<<database>>" does not exist',
  'a refused forward, database user open': '(SSH) Channel open failure',
  'an SSH host that timed out, alias at': 'SSH tunnel: SSH connection failed',
  'an SSH host this device never reached': 'SSH tunnel: SSH connection failed',
  'an ssh2 disconnect the SSH host described':
    'SSH tunnel: SSH connection failed',
  'an unreachable SSH host with its port attached':
    "SSH tunnel: Can't reach the SSH host at <ssh-host>: ECONNREFUSED",
  'an unreachable SSH host, alias SSH and database ssh':
    'SSH tunnel: SSH connection failed',
  'an unreachable SSH host, alias host': 'SSH tunnel: SSH connection failed',
  'several containers, wrapped by the SQL Server driver':
    'SSH tunnel: Several containers run the service <host>: <containers>. Use the container name as the host.',
}

test.each(Object.entries(released))(
  'sends what v0.99.6 wrote for %s without a name',
  async (name, request) => {
    const { error: _, options, ...settings } = request as DiagnosisRequest
    expect(await diagnosed(request as DiagnosisRequest)).toEqual([
      {
        error: FORWARDED[name as keyof typeof released],
        settings: {
          ...settings,
          options: OPTIONS_SENT[options],
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
      passwordSet: true,
      port: '22 bastion',
      sshEnabled: false,
      type: null,
      userSet: true,
    })
  ).toEqual([
    {
      error: 'password authentication failed for user "<user>"',
      settings: {
        hostKind: '',
        options: 'sslmode=require',
        passwordSet: true,
        port: '',
        runtime: 'desktop',
        sshEnabled: false,
        type: null,
        userSet: true,
      },
    },
  ])
})
