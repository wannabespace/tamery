import {
  Delete02Icon,
  NoteIcon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tamery/ui/components/alert-dialog'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
  smallItemInsetClassName,
} from '@tamery/ui/components/item'
import { Textarea } from '@tamery/ui/components/textarea'
import { cn } from '@tamery/ui/lib/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useRef, useState } from 'react'

import { useCollections } from '~/core/collections'
import { schemaNotes } from '~/core/schema-notes/notes'
import type { SchemaNote } from '~/core/schema-notes/sync'

const getTarget = ({ column, table }: SchemaNote) =>
  table && (column ? `${table}.${column}` : table)

const NoteRow = ({
  note,
  onDelete,
}: {
  note: SchemaNote
  onDelete: (note: SchemaNote) => void
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const kept = draft?.trim()
  const target = getTarget(note)

  useHotkey('Escape', () => setDraft(null), {
    enabled: draft !== null,
    target: fieldRef,
  })

  const save = () => {
    if (!kept) {
      onDelete(note)
      return
    }
    schemaNotes.edit(note, kept)
    setDraft(null)
  }

  return (
    <Item size="sm" variant="grouped">
      <ItemContent>
        <ItemTitle>
          {target ? (
            <span data-mask className="font-mono">
              {target}
            </span>
          ) : (
            'Whole database'
          )}
        </ItemTitle>
        {draft === null ? (
          <ItemDescription data-mask>{note.note}</ItemDescription>
        ) : (
          <Textarea
            ref={fieldRef}
            data-mask
            autoFocus
            aria-label="Note"
            onFocus={({ currentTarget: field }) =>
              field.setSelectionRange(field.value.length, field.value.length)
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
      </ItemContent>
      <ItemActions>
        {draft === null ? (
          <>
            <IconButton
              icon={PencilEdit02Icon}
              label="Edit note"
              size="icon-xs"
              variant="ghost-muted"
              onClick={() => setDraft(note.note)}
            />
            <IconButton
              icon={Delete02Icon}
              label="Delete note"
              size="icon-xs"
              variant="ghost-destructive"
              onClick={() => onDelete(note)}
            />
          </>
        ) : (
          <>
            <Button
              size="xs"
              variant="ghost-muted"
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button size="xs" disabled={kept === note.note} onClick={save}>
              Save
            </Button>
          </>
        )}
      </ItemActions>
    </Item>
  )
}

const DeleteNoteDialog = ({
  note,
  onClose,
}: {
  note: SchemaNote | null
  onClose: () => void
}) => {
  const [shown, setShown] = useState(note)
  if (note && note !== shown) {
    setShown(note)
  }
  const target = shown && getTarget(shown)

  return (
    <AlertDialog
      open={!!note}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => !open && setShown(null)}
    >
      {shown && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Tamery AI stops reading the note on{' '}
              {target ? (
                <span data-mask className="font-semibold">
                  {target}
                </span>
              ) : (
                'this database'
              )}
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogCancel
              variant="destructive"
              onClick={() => note && schemaNotes.remove(note)}
            >
              Delete
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}

export const SchemaNotesSettings = () => {
  const {
    connectionsCollection,
    connectionsResourcesCollection,
    schemaNotesCollection,
  } = useCollections()
  const { data: rows, isReady } = useLiveQuery({
    query: (q) =>
      q
        .from({ note: schemaNotesCollection })
        .innerJoin(
          { resource: connectionsResourcesCollection },
          ({ note, resource }) => eq(note.connectionResourceId, resource.id)
        )
        .innerJoin(
          { connection: connectionsCollection },
          ({ connection, resource }) => eq(resource.connectionId, connection.id)
        )
        .select(({ connection, note, resource }) => ({
          connection,
          note,
          resource,
        }))
        .orderBy(({ connection }) => connection.name)
        .orderBy(({ resource }) => resource.name)
        .orderBy(({ note }) => note.table)
        .orderBy(({ note }) => note.column),
  })
  const [deleting, setDeleting] = useState<SchemaNote | null>(null)

  if (!isReady) {
    return null
  }

  const groups = Map.groupBy(rows, ({ resource }) => resource.id)

  return (
    <>
      <p
        className={cn(smallItemInsetClassName, 'text-muted-foreground text-sm')}
      >
        Facts a schema does not say, like a unit or what a code means. Tamery AI
        reads a database’s notes in every prompt about it and saves new ones as
        it learns them.
      </p>
      {groups.size === 0 && (
        <IconEmpty
          icon={NoteIcon}
          title="No schema notes yet"
          description="Tamery AI saves one when it learns a fact about your data. Add your own to a table in the schema visualizer."
        />
      )}
      {[...groups].map(([resourceId, group]) => {
        const [first] = group
        return (
          first && (
            <SettingsGroup
              key={resourceId}
              title={
                <span className="flex items-center gap-1.5">
                  <ConnectionIcon
                    type={first.connection.type}
                    provider={first.connection.provider}
                    className="size-3.5"
                  />
                  <span data-mask>
                    {first.connection.name}
                    {first.resource.name && ` / ${first.resource.name}`}
                  </span>
                </span>
              }
            >
              {group.map(({ note }) => (
                <NoteRow key={note.id} note={note} onDelete={setDeleting} />
              ))}
            </SettingsGroup>
          )
        )
      })}
      <DeleteNoteDialog note={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}
