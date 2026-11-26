import { formatSchemaNotes } from '@tamery/ai/schema-notes'
import { v7 } from 'uuid'

import { getCollections, mutateOffline } from '~/core/collections'
import { posthog } from '~/lib/posthog'

import type { SchemaNote } from './sync'

type NoteTarget = Pick<
  SchemaNote,
  'column' | 'connectionResourceId' | 'schema' | 'table'
>

const getKind = ({ column, table }: Pick<SchemaNote, 'column' | 'table'>) => {
  if (column) {
    return 'column'
  }
  return table ? 'table' : 'database'
}

/** Every write to the user's schema notes, each tracked with what it is about and where it came from. */
export const schemaNotes = {
  add: (target: NoteTarget & { note: string }, source: 'agent' | 'manual') => {
    posthog.capture('schema_note_added', { kind: getKind(target), source })
    return mutateOffline(() =>
      getCollections().schemaNotesCollection.insert({
        ...target,
        createdAt: new Date(),
        id: v7(),
        updatedAt: new Date(),
      })
    )
  },
  edit: (note: SchemaNote, text: string) => {
    posthog.capture('schema_note_edited', { kind: getKind(note) })
    return mutateOffline(() =>
      getCollections().schemaNotesCollection.update(note.id, (draft) => {
        draft.note = text
        draft.updatedAt = new Date()
      })
    )
  },
  /** An AI prompt's database context with the resource's notes after it. */
  inContext: (context: string, connectionResourceId: string) =>
    [
      context,
      formatSchemaNotes(
        getCollections().schemaNotesCollection.toArray.filter(
          (note) => note.connectionResourceId === connectionResourceId
        )
      ),
    ]
      .filter(Boolean)
      .join('\n\n'),
  remove: (note: SchemaNote) => {
    posthog.capture('schema_note_removed', { kind: getKind(note) })
    return mutateOffline(() =>
      getCollections().schemaNotesCollection.delete(note.id)
    )
  },
}
