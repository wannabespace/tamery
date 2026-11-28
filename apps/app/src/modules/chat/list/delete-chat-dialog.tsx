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

import { chatActions } from './chat-actions'

export const DeleteChatDialog = ({
  chat,
  onClose,
  resourceId,
}: {
  chat: { id: string; title: string } | null
  onClose: () => void
  resourceId: string
}) => {
  const [shown, setShown] = useState(chat)
  if (chat && chat !== shown) {
    setShown(chat)
  }
  return (
    <AlertDialog
      open={!!chat}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => !open && setShown(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Chat</AlertDialogTitle>
          <AlertDialogDescription>
            Delete{' '}
            <span data-mask className="font-semibold">
              {shown?.title}
            </span>
            ? This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
          <AlertDialogCancel
            variant="destructive"
            onClick={() => {
              if (chat) {
                chatActions.remove(resourceId, chat.id)
              }
            }}
          >
            Delete
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
