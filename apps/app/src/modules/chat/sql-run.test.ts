import { expect, mock, test } from 'bun:test'

const prepareWrite = mock(() =>
  Promise.resolve({ kind: 'write', run: () => Promise.resolve([]) })
)
mock.module('~/core/agent/database', () => ({
  agentDatabase: { prepareWrite },
}))
mock.module('~/core/collections', () => ({
  getCollections: () => ({
    connectionsResourcesCollection: {
      get: () => ({ connectionId: 'connection', name: 'chat-db' }),
    },
  }),
}))
mock.module('~/lib/posthog', () => ({ posthog: { capture: () => {} } }))
mock.module('./auto-approval', () => ({ getJudgedProbability: () => null }))

const { runSql } = await import('./sql-run')

test('running a skipped change keeps the resource shown on the card', async () => {
  const target = { connectionId: 'connection', resource: 'proposal-db' }
  const statement = 'insert into fixtures (id) values (1)'
  const result = await runSql({
    connectionResourceId: 'chat-resource',
    signal: new AbortController().signal,
    skipped: { target, toolCallId: 'proposal' },
    statement,
  })

  expect(prepareWrite).toHaveBeenCalledWith({ ...target, statement })
  expect(result.data).toMatchObject({ ...target, error: null })
})
