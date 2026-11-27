import '@tamery/shared/arktype-config'
import { expect, mock, test } from 'bun:test'
import process from 'node:process'

import { os } from '@orpc/server'

Object.assign(process.env, {
  DATABASE_URL: 'postgres://test@127.0.0.1:1/test',
  ENCRYPTION_SECRET: 'test-encryption-secret-of-32-chars',
  USER_KEY_SECRET: 'test-user-key-secret-of-32-chars',
})
mock.module('@tamery/db', () => ({ db: {} }))
mock.module('~/lib/redis', () => ({
  redis: {},
  redisSubscriber: { on: () => {} },
}))
mock.module('~/lib/workspace', () => ({
  ensureDefaultWorkspace: {},
  inEditableWorkspace: {},
  inMemberWorkspace: {},
  isWorkspaceEditor: {},
  publishToUsers: {},
  publishToWorkspace: {},
}))
mock.module('~/lib/encryption-key', () => ({ workspaceEncryptionKey: {} }))
mock.module('~/lib/connection-string', () => ({ encryptConnectionString: {} }))
const passThrough = os.middleware(({ next }) => next())
mock.module('~/orpc', () => ({
  aiPermissionsMiddleware: passThrough,
  authMiddleware: passThrough,
  orpc: os,
  permissionsMiddleware: passThrough,
  permix: { checkMiddleware: () => passThrough },
}))

const id = (n: number) => `0190a000-0000-7000-8000-00000000000${n}`
const [
  chats,
  chatsMessages,
  connectionMachines,
  connectionsCreate,
  connectionsUpdate,
  connectionsResources,
  queries,
  schemaNotes,
] = await Promise.all([
  import('~/modules/chat/routers/chats/create'),
  import('~/modules/chat/routers/chats-messages/create'),
  import('./connection-machines/create'),
  import('./connections/create'),
  import('./connections/update'),
  import('./connections-resources/create'),
  import('./queries/create'),
  import('./schema-notes/create'),
])
const procedures = {
  'chats.create': [chats.create, { connectionResourceId: id(2), id: id(1) }],
  'chatsMessages.create': [
    chatsMessages.create,
    { chatId: id(2), id: id(1), parts: [], role: 'user' },
  ],
  'connectionMachines.create': [
    connectionMachines.create,
    { connectionId: id(2), id: id(1), machineId: id(3) },
  ],
  'connections.create': [
    connectionsCreate.create,
    {
      connectionString: 'postgres://host',
      id: id(1),
      isPasswordExists: false,
      name: 'db',
      syncType: 'cloud',
      type: 'postgres',
    },
  ],
  'connections.update': [connectionsUpdate.update, { id: id(1), name: 'db' }],
  'connectionsResources.create': [
    connectionsResources.create,
    { connectionId: id(2), id: id(1), name: null },
  ],
  'queries.create': [
    queries.create,
    { connectionResourceId: id(2), id: id(1), name: 'q', query: 'select 1' },
  ],
  'schemaNotes.create': [
    schemaNotes.create,
    { connectionResourceId: id(2), id: id(1), note: 'n' },
  ],
} as const

test.each(Object.entries(procedures))(
  '%s keeps the client clock out of updatedAt',
  async (_, [procedure, input]) => {
    const { inputSchemas } = procedure['~orpc']
    expect(inputSchemas).toHaveLength(1)
    const schema = inputSchemas?.[0]
    const validated = await schema?.['~standard'].validate({
      ...input,
      updatedAt: new Date(Date.UTC(2020, 0, 1)),
    })
    expect(validated).toHaveProperty('value.id', id(1))
    expect(validated).not.toHaveProperty('value.updatedAt')
  }
)
