import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient, fullSignOut } from '~/lib/auth'
import { handleError } from '~/utils/error'

export const DeleteAccount = () => {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const { mutate, isPending } = useMutation({
    meta: { event: 'account_deleted' },
    mutationFn: () => authClient.deleteUser({ fetchOptions: { throw: true } }),
    onError: (error) => handleError(error),
    onSuccess: async () => {
      toast.success('Account deleted successfully')
      await fullSignOut()
    },
  })

  return (
    <SettingsGroup title="Account">
      <SettingsRow
        title="Delete account"
        description="Removes your account and all of its data for good."
      >
        <Dialog
          open={open}
          onOpenChange={setOpen}
          onOpenChangeComplete={(nextOpen) => !nextOpen && setConfirmation('')}
        >
          <DialogTrigger render={<Button variant="destructive" size="sm" />}>
            Delete
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-sm"
            onSubmit={(event) => {
              event.preventDefault()
              mutate()
            }}
            render={<form />}
          >
            <DialogHeader>
              <DialogTitle>Delete account</DialogTitle>
              <DialogDescription>
                Your account, subscription, settings and sessions are removed,
                and our copy of your data is erased after 90 days. This cannot
                be undone.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="delete-confirmation">
                Type <span className="font-mono">delete</span> to confirm
              </FieldLabel>
              <Input
                id="delete-confirmation"
                placeholder="delete"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={isPending}
                autoComplete="off"
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={confirmation !== 'delete' || isPending}
              >
                <LoadingContent loading={isPending}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Delete account
                </LoadingContent>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsRow>
    </SettingsGroup>
  )
}
