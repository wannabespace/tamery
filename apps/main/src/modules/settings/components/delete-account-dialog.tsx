import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { posthog } from '~/lib/posthog'
import { handleError } from '~/utils/error'

export const DeleteAccountDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState('')

  const { mutate, isPending } = useMutation({
    meta: { event: 'account_deleted' },
    mutationFn: async () => {
      const { error } = await authClient.deleteUser({
        callbackURL: '/sign-in',
      })

      if (error) {
        throw error
      }
    },
    onError: handleError,
    onSuccess: () => {
      toast.success('Account deleted successfully')
      void posthog.reset()
      router.navigate({ to: '/sign-in' })
    },
  })

  const isConfirmed = confirmation === 'delete'

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmation('')
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onSubmit={(e) => {
          e.preventDefault()
          mutate()
        }}
        render={<form />}
      >
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            Your account, subscription, settings and sessions are removed, and
            our copy of your data is erased after 90 days. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="delete-confirmation">
            Type <span className="font-mono">delete</span> to confirm
          </FieldLabel>
          <Input
            id="delete-confirmation"
            type="text"
            placeholder="delete"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => handleOpenChange(false)}
            className="w-full sm:w-auto"
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={!isConfirmed || isPending}
          >
            <LoadingContent loading={isPending}>
              <HugeiconsIcon
                icon={Delete02Icon}
                strokeWidth={2}
                className="size-4"
              />
              Delete account
            </LoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
