import { ORPCError } from '@orpc/client'
import { silently } from '@tamery/shared/utils'
import type { OfflineExecutor } from '@tanstack/offline-transactions'
import {
  NonRetriableError,
  startOfflineExecutor,
} from '@tanstack/offline-transactions'
import { getRouteApi } from '@tanstack/react-router'

import { createConnectionStringsCollection } from '~/core/connection/connection-strings'
import {
  createConnectionsCollection,
  createConnectionsResourcesCollection,
} from '~/core/connection/sync'
import { createSchemaNotesCollection } from '~/core/schema-notes/sync'
import { createWorkspacesCollection } from '~/core/workspace/sync'
import {
  createChatsCollection,
  createChatsMessagesCollection,
  createChatsMessagesPartsCollection,
} from '~/modules/chat/sync'
import { createQueriesCollection } from '~/modules/runner/sync'
import { isServerError } from '~/utils/error'

const createCollections = () => {
  const connectionsResourcesCollection = createConnectionsResourcesCollection()
  const connectionStringsCollection = createConnectionStringsCollection(
    connectionsResourcesCollection
  )

  return {
    chatsCollection: createChatsCollection(),
    chatsMessagesCollection: createChatsMessagesCollection(),
    chatsMessagesPartsCollection: createChatsMessagesPartsCollection(),
    connectionStringsCollection,
    connectionsCollection: createConnectionsCollection(
      connectionStringsCollection
    ),
    connectionsResourcesCollection,
    queriesCollection: createQueriesCollection(),
    schemaNotesCollection: createSchemaNotesCollection(),
    workspacesCollection: createWorkspacesCollection(),
  }
}

type Collections = ReturnType<typeof createCollections>

let current: { collections: Collections; offline: OfflineExecutor } | null =
  null

const init = () => {
  if (current) {
    return current
  }

  const collections = createCollections()

  current = {
    collections,
    offline: startOfflineExecutor({
      collections,
      mutationFns: {
        // Sequential: a connection must land before the resource referencing it.
        push: async ({ transaction }) => {
          for (const mutation of transaction.mutations) {
            const { push } = mutation.collection.utils
            if (!push) {
              throw new NonRetriableError(
                `${mutation.collection.id} cannot be written offline`
              )
            }
            // oxlint-disable-next-line no-await-in-loop
            await push(mutation).catch((error: unknown) => {
              // The executor retries every other error forever.
              if (error instanceof ORPCError && !isServerError(error)) {
                throw new NonRetriableError(error.message)
              }
              throw error
            })
          }
        },
      },
    }),
  }

  return current
}

export const getCollections = (): Collections => init().collections

export const whenOfflineReady = () => init().offline.waitForInit()

export const mutateOffline = (mutate: () => void) => {
  const tx = init().offline.createOfflineTransaction({
    autoCommit: false,
    mutationFnName: 'push',
  })
  const transaction = tx.mutate(mutate)
  silently(() => tx.commit())
  silently(() => transaction.isPersisted.promise)
  return transaction
}

export const cleanCollections = async () => {
  if (!current) {
    return
  }

  const { collections, offline } = current
  current = null
  await offline.clearOutbox()
  offline.dispose()
  // Not collection.cleanup(): it wipes rows under still-mounted live queries.
  for (const collection of Object.values(collections)) {
    if ('abortSync' in collection.utils) {
      collection.utils.abortSync()
    }
  }
}

const { useRouteContext } = getRouteApi('/_protected')

export const useCollections = (): Collections => useRouteContext().collections
