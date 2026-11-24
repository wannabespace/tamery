import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tamery/ui/components/alert-dialog'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { useState } from 'react'

export const ConfirmAction = ({
  action,
  description,
  isPending,
  onConfirm,
  title,
}: {
  action: string
  description: string
  isPending: boolean
  onConfirm: (close: () => void) => void
  title: string
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        {action}
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default">
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => onConfirm(() => setIsOpen(false))}
          >
            <LoadingContent loading={isPending}>{action}</LoadingContent>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
