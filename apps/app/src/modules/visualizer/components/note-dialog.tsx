import { Button } from '@tamery/ui/components/button'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { Textarea } from '@tamery/ui/components/textarea'
import { useState } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { schemaNotes } from '~/core/schema-notes/notes'
import type { SchemaNote } from '~/core/schema-notes/sync'

import type { DiagramTable } from '../lib/schema'

/** Adds a note to the table or one of its columns, or edits or deletes an existing one; remounted per open, so its fields start from `editing`. */
export const NoteDialogContent = ({
  editing,
  onClose,
  table,
}: {
  editing: SchemaNote | null
  onClose: () => void
  table: DiagramTable
}) => {
  const { connectionResource } = useConnectionContext()
  const [column, setColumn] = useState(editing?.column ?? null)
  const [text, setText] = useState(editing?.note ?? '')
  const kept = text.trim()
  const targets = [
    { label: `The ${table.kind} itself`, value: null },
    ...table.columns.map(({ id, name }) => ({ label: name, value: id })),
  ]

  const save = () => {
    if (editing) {
      schemaNotes.edit(editing, kept)
    } else {
      schemaNotes.add(
        {
          column,
          connectionResourceId: connectionResource.id,
          note: kept,
          schema: table.schema,
          table: table.table,
        },
        'manual'
      )
    }
    onClose()
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit Note' : 'Add Note'}</DialogTitle>
        <DialogDescription>
          A fact the schema does not say, like a unit or what a code means.
          Every AI prompt about this database gets it.
        </DialogDescription>
      </DialogHeader>
      {!editing && (
        <Field>
          <FieldLabel htmlFor="note-dialog-target">About</FieldLabel>
          <Select items={targets} value={column} onValueChange={setColumn}>
            <SelectTrigger id="note-dialog-target" data-mask className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent data-mask>
              {targets.map(({ label, value }) => (
                <SelectItem key={label} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="note-dialog-text">Note</FieldLabel>
        <Textarea
          id="note-dialog-text"
          data-mask
          autoFocus
          value={text}
          placeholder="Amounts are in cents"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <DialogFooter>
        {editing && (
          <Button
            variant="ghost-destructive"
            className="mr-auto"
            onClick={() => {
              schemaNotes.remove(editing)
              onClose()
            }}
          >
            Delete
          </Button>
        )}
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button disabled={!kept} onClick={save}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
