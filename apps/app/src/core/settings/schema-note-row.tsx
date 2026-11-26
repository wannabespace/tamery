import { Delete02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@tamery/ui/components/item'
import { Textarea } from '@tamery/ui/components/textarea'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useRef, useState } from 'react'

import { getNoteLabel, schemaNotes } from '~/core/schema-notes/notes'
import type { SchemaNote } from '~/core/schema-notes/sync'

export const SchemaNoteRow = ({
  note,
  onDelete,
}: {
  note: SchemaNote
  onDelete: (note: SchemaNote) => void
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const kept = draft?.trim()
  const target = getNoteLabel(note)

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
