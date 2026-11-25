import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { createCollection } from '@tanstack/react-db'

import { persistence } from '~/lib/database'
import { orpc } from '~/lib/orpc'
import type { BaseTable } from '~/lib/sync'
import { PERSISTED_SCHEMA_VERSION, syncCollectionOptions } from '~/lib/sync'

export interface Machine extends BaseTable {
  name: string
  seenAt: Date
  urls: string[]
}

/** Where a connection runs for this user; no row means here, the cloud proxy on the web or this computer on desktop. Read it as `RunsOn`. */
export interface ConnectionMachine extends BaseTable {
  connectionId: string
  /** `null` is Tamery Cloud. */
  machineId: string | null
}

export const createMachinesCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<Machine>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.machines.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'machines',
        mutations: {
          delete: (id) => orpc.machines.remove.call({ id }),
        },
        sync: ({ rows, signal }) => orpc.machines.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )

export const createConnectionMachinesCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<ConnectionMachine>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.connectionMachines.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'connection-machines',
        mutations: {
          delete: (id) => orpc.connectionMachines.remove.call({ id }),
          insert: (value) => orpc.connectionMachines.create.call(value),
          update: (id, _changes, { machineId }) =>
            orpc.connectionMachines.update.call({ id, machineId }),
        },
        sync: ({ rows, signal }) =>
          orpc.connectionMachines.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )
