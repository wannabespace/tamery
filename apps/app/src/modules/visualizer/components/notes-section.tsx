import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { and, eq, useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import type { SchemaNote } from '~/core/schema-notes/sync'

import type { DiagramTable } from '../lib/schema'
import { EmptyRow, List, Section, rowClass } from './inspector-sections'
import { NoteDialog } from './note-dialog'

export const NotesSection = ({ table }: { table: DiagramTable }) => {
  const { connectionResource } = useConnectionContext()
  const { schemaNotesCollection } = useCollections()
  const { data: notes } = useLiveQuery({
    query: (q) =>
      q
        .from({ notes: schemaNotesCollection })
        .where(({ notes: note }) =>
          and(
            eq(note.connectionResourceId, connectionResource.id),
            eq(note.schema, table.schema),
            eq(note.table, table.table)
          )
        )
        .orderBy(({ notes: note }) => note.createdAt, 'asc'),
  })
  const [dialog, setDialog] = useState<{ editing: SchemaNote | null } | null>(
    null
  )

  return (
    <Section
      title="Notes"
      action={
        <Button
          variant="ghost-muted"
          size="xs"
          onClick={() => setDialog({ editing: null })}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add
        </Button>
      }
    >
      <List>
        {notes.map((note) => (
          <li key={note.id} className={rowClass}>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => setDialog({ editing: note })}
            >
              <span
                data-mask
                className="text-muted-foreground max-w-[35%] shrink-0 truncate font-mono"
              >
                {note.column ?? table.kind}
              </span>
              <span data-mask className="min-w-0 flex-1 truncate">
                {note.note}
              </span>
            </button>
          </li>
        ))}
        {notes.length === 0 && <EmptyRow>No notes yet</EmptyRow>}
      </List>
      {dialog && (
        <NoteDialog
          editing={dialog.editing}
          table={table}
          onClose={() => setDialog(null)}
        />
      )}
    </Section>
  )
}
