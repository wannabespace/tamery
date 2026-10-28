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

export interface MemberConfirmation {
  action: 'demote' | 'remove'
  member: { id: string; name: string }
}

const COPY = {
  demote: {
    consequence:
      'can still open and query its connections, but the shares they made of its tables stop working.',
    title: 'Make Viewer',
    verb: 'Make viewer',
  },
  remove: {
    consequence:
      'loses this workspace and its connections on all their devices, and the shares they made of its tables stop working.',
    title: 'Remove Member',
    verb: 'Remove',
  },
}

export const MemberConfirmDialog = ({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: MemberConfirmation | null
  onCancel: () => void
  onConfirm: (confirmation: MemberConfirmation) => void
}) => {
  const [shown, setShown] = useState(confirmation)
  if (confirmation && confirmation !== shown) {
    setShown(confirmation)
  }

  return (
    <AlertDialog
      open={!!confirmation}
      onOpenChange={(open) => !open && onCancel()}
      onOpenChangeComplete={(open) => !open && setShown(null)}
    >
      {shown && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{COPY[shown.action].title}</AlertDialogTitle>
            <AlertDialogDescription>
              <span data-mask className="font-semibold">
                {shown.member.name}
              </span>{' '}
              {COPY[shown.action].consequence}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogCancel
              variant="destructive"
              onClick={() => confirmation && onConfirm(confirmation)}
            >
              {COPY[shown.action].verb}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
