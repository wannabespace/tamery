import type { Passkey } from '@better-auth/passkey/client'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'

const RenameForm = ({
  id,
  currentName,
  onRenamed,
}: {
  id: string
  currentName: string
  onRenamed: () => void
}) => {
  const [name, setName] = useState(currentName)
  const { mutate: rename, isPending } = useMutation({
    meta: { event: 'passkey_renamed' },
    mutationFn: () =>
      authClient.passkey.updatePasskey({
        fetchOptions: { throw: true },
        id,
        name: name.trim(),
      }),
    onError: handleError,
    onSuccess: onRenamed,
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        rename()
      }}
    >
      <Field>
        <FieldLabel htmlFor={`passkey-name-${id}`}>Name</FieldLabel>
        <Input
          id={`passkey-name-${id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          required
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={isPending || !name.trim()}>
          <LoadingContent loading={isPending}>Save</LoadingContent>
        </Button>
      </DialogFooter>
    </form>
  )
}

export const PasskeyItem = ({
  id,
  name,
  createdAt,
  refetchPasskeys,
}: Pick<Passkey, 'createdAt' | 'id' | 'name'> & {
  refetchPasskeys: () => void
}) => {
  const [isRenaming, setIsRenaming] = useState(false)
  const { mutate: deletePasskey, isPending } = useMutation({
    meta: { event: 'passkey_deleted' },
    // Not fetchOptions.throw: its error carries only the HTTP status text, and the server's refusal has to reach the toast.
    mutationFn: async () => {
      const { error } = await authClient.passkey.deletePasskey({ id })

      if (error) {
        throw error
      }
    },
    onError: handleError,
    onSuccess: () => {
      refetchPasskeys()
      toast.success('Passkey deleted')
    },
  })

  return (
    <SettingsRow
      icon={<span className="size-4" />}
      title={<span data-mask>{name || 'Passkey'}</span>}
      description={`Added ${format(createdAt, 'PP')}`}
    >
      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          Rename
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename passkey</DialogTitle>
          </DialogHeader>
          <RenameForm
            id={id}
            currentName={name ?? ''}
            onRenamed={() => {
              refetchPasskeys()
              setIsRenaming(false)
            }}
          />
        </DialogContent>
      </Dialog>
      <ConfirmAction
        action="Delete"
        title="Delete this passkey?"
        description="You can no longer sign in with it. Remove it from your password manager too."
        isPending={isPending}
        onConfirm={(close) => deletePasskey(undefined, { onSuccess: close })}
      />
    </SettingsRow>
  )
}
