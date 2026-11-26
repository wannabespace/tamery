import { expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'
import { SSH_ON_ERRORS } from '@tamery/connection/diagnosis-request'
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

const SSH_FAILURES = {
  auth: 'SSH tunnel: SSH sign-in failed',
  config: "SSH tunnel: ~/.ssh/config couldn't be used",
  docker: "SSH tunnel: The SSH host couldn't find the database container",
  failed: 'SSH tunnel: SSH connection failed',
  forward:
    "SSH tunnel: The SSH host didn't forward the connection to the database",
  refused: 'SSH tunnel: The SSH host refused the connection',
  unreachable: "SSH tunnel: Can't reach the SSH host",
}

const FORWARDED: Record<keyof typeof released, string> = {
  'a Match without its value': SSH_FAILURES.config,
  'a failed SSH sign-in': SSH_FAILURES.auth,
  'a malformed HostName, database user line': 'Connection failed',
  'a missing database named database': 'Database does not exist',
  'a refused forward, database user open': SSH_FAILURES.forward,
  'a refused forward, database user open and database failure':
    SSH_FAILURES.forward,
  'an SSH host that timed out, alias at': SSH_FAILURES.failed,
  'an SSH host this device never reached': SSH_FAILURES.unreachable,
  'an ssh2 disconnect the SSH host described': SSH_FAILURES.failed,
  'an ssh2 disconnect, alias SSH and database user tunnel': SSH_FAILURES.failed,
  'an unreachable SSH host with its port attached': SSH_FAILURES.refused,
  'an unreachable SSH host, alias SSH and database ssh': SSH_FAILURES.refused,
  'an unreachable SSH host, alias host': SSH_FAILURES.refused,
  'several containers, wrapped by the SQL Server driver': SSH_FAILURES.docker,
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

const SSH_WORDS = [
  'SSH',
  'tunnel',
  'Channel',
  'open',
  'failure',
  'Disconnected',
  'connection',
  'failed',
  'reach',
  'host',
  'line',
  'break',
]
const AMBIGUOUS = [
  'SSH tunnel: SSH connection failed: Disconnected by bastion.corp.io',
  '(SSH) Channel open failure: Connection refused by bastion.corp.io',
  "SSH tunnel: Can't reach the SSH host at bastion.corp.io: ECONNREFUSED",
  'Unexpected line break at ssl-does-not-exist.corp.io',
  'bastion.corp.io password authentication failed',
].flatMap((failure) =>
  SSH_WORDS.flatMap((word, index) =>
    SSH_WORDS.slice(index + 1).map((other) =>
      failure.replaceAll(word, '<user>').replaceAll(other, '<database>')
    )
  )
)

test('sends the model only a fixed error for any request with SSH on', async () => {
  const requests = [
    ...Object.values(released).map((request) => request as DiagnosisRequest),
    ...AMBIGUOUS.map((error) => ({
      ...(released[
        'an ssh2 disconnect the SSH host described'
      ] as DiagnosisRequest),
      error,
    })),
  ].filter(({ sshEnabled }) => sshEnabled)
  const inputs = await Promise.all(
    requests.map(async (request) => {
      const [input] = await diagnosed(request)
      return (input as { error: string }).error
    })
  )
  expect(new Set(inputs).isSubsetOf(SSH_ON_ERRORS)).toBe(true)
})

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
