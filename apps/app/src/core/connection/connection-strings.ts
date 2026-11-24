import { connectionSecrets } from '@tamery/connection/secrets'
import { describeConnectionString } from '@tamery/connection/utils'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import type { PersistedCollectionUtils } from '@tanstack/db-sqlite-persistence-core'
import type { Collection } from '@tanstack/react-db'
import { BasicIndex, createCollection } from '@tanstack/react-db'
import { toast } from 'sonner'

import { fullSignOut } from '~/lib/auth'
import { persistence } from '~/lib/database'
import { deviceEncryption } from '~/lib/device-encryption'
import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'
import { PERSISTED_SCHEMA_VERSION } from '~/lib/sync'

import type { Connection, ConnectionResource } from './sync'

export type ConnectionString = ReturnType<typeof describeConnectionString> & {
  connectionId: string
  encrypted: string
  updatedAt: Date
}

export type ConnectionStringInput = Pick<
  ConnectionString,
  'connectionId' | 'updatedAt'
> & {
  connectionString: string
}

// oxlint-disable-next-line typescript/consistent-type-definitions
type ConnectionStringsUtils = {
  decrypt: (connectionId: string) => Promise<string>
  dropQueries: (connectionId: string) => void
  /** `write` stores the record synchronously, so a caller can check the stored one right before it. */
  prepareWrite: (data: ConnectionStringInput) => Promise<{
    record: ConnectionString
    write: () => void
  }>
  resolve: (
    connection: Pick<Connection, 'id' | 'isPasswordExists'>,
    signal: AbortSignal
  ) => Promise<void>
}

export type ConnectionStringsCollection = Collection<
  ConnectionString,
  string,
  ConnectionStringsUtils & PersistedCollectionUtils
>

export const createConnectionStringsCollection = (
  resources: Collection<ConnectionResource>
): ConnectionStringsCollection => {
  const collection: ConnectionStringsCollection = createCollection(
    persistedCollectionOptions<
      ConnectionString,
      string,
      never,
      ConnectionStringsUtils
    >({
      autoIndex: 'eager',
      defaultIndexType: BasicIndex,
      gcTime: 0,
      getKey: (item) => item.connectionId,
      id: 'connection-strings',
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
      utils: {
        async decrypt(connectionId: string) {
          const record = collection.get(connectionId)

          if (!record) {
            const result = await orpc.connections.resolve.call({
              id: connectionId,
            })

            if (result.status === 'modified') {
              return result.connectionString
            }

            throw new Error(
              `No connection string found for connection "${connectionId}"`
            )
          }

          try {
            return await deviceEncryption.decrypt(record.encrypted)
          } catch (error) {
            if (!isKeychainLocked(error)) {
              await fullSignOut()
              toast.error(
                'Your encryption key is invalid. Please, sign in again.',
                { id: 'encryption-key-invalid' }
              )
            }
            throw error
          }
        },
        dropQueries(connectionId) {
          void queryClient.resetQueries({
            predicate: ({ queryKey: [, id] }) =>
              id === connectionId ||
              (typeof id === 'string' &&
                resources.get(id)?.connectionId === connectionId),
          })
        },
        async prepareWrite(data) {
          const previous = collection.has(data.connectionId)
            ? await collection.utils.decrypt(data.connectionId)
            : null
          const record = {
            ...describeConnectionString(data.connectionString),
            connectionId: data.connectionId,
            encrypted: await deviceEncryption.encrypt(data.connectionString),
            updatedAt: data.updatedAt,
          }
          const write = () => {
            if (collection.has(data.connectionId)) {
              collection.update(data.connectionId, (draft) => {
                Object.assign(draft, record)
              })
            } else {
              collection.insert(record)
            }
            // Compares the plain strings: a rename saves the same string under a new `updatedAt`.
            if (previous !== data.connectionString) {
              collection.utils.dropQueries(data.connectionId)
            }
          }
          return { record, write }
        },
        async resolve(connection, signal) {
          const local = collection.get(connection.id)

          const result = await orpc.connections.resolve.call({
            id: connection.id,
            updatedAt: local?.updatedAt,
          })

          if (result.status !== 'modified') {
            return
          }

          const { write } = await collection.utils.prepareWrite({
            connectionId: connection.id,
            connectionString: local
              ? connectionSecrets.restore(result.connectionString, {
                  isPasswordExists: connection.isPasswordExists,
                  local: await collection.utils.decrypt(connection.id),
                })
              : result.connectionString,
            updatedAt: result.updatedAt,
          })

          if (signal.aborted) {
            return
          }
          // Another write landed while this one waited, and the answer may predate it: ask again.
          if (collection.get(connection.id)?.encrypted !== local?.encrypted) {
            return collection.utils.resolve(connection, signal)
          }
          write()
        },
      },
    })
  )

  return collection
}
