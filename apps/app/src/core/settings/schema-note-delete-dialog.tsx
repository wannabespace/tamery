import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tamery/ui/components/alert-dialog'
import { useState } from 'react'

import { getNoteLabel, schemaNotes } from '~/core/schema-notes/notes'
import type { SchemaNote } from '~/core/schema-notes/sync'

export const SchemaNoteDeleteDialog = ({
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
  const target = shown && getNoteLabel(shown)

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
