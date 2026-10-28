import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { createCollection } from '@tanstack/react-db'

import { persistence } from '~/lib/database'
import { orpc } from '~/lib/orpc'
import type { BaseTable } from '~/lib/sync'
import { PERSISTED_SCHEMA_VERSION, syncCollectionOptions } from '~/lib/sync'

export interface SchemaNote extends BaseTable {
  column: string | null
  connectionResourceId: string
  note: string
  schema: string | null
  table: string | null
}

export const createSchemaNotesCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<SchemaNote>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.schemaNotes.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'schema-notes',
        mutations: {
          delete: (id) => orpc.schemaNotes.remove.call({ id }),
          insert: (value) => orpc.schemaNotes.create.call(value),
          update: (id, { note }) => orpc.schemaNotes.update.call({ id, note }),
        },
        sync: ({ rows, signal }) =>
          orpc.schemaNotes.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )
