import type { Passkey } from '@better-auth/passkey/client'
import { Button } from '@tamery/ui/components/button'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tamery/ui/components/dialog'
import { useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'
import { RenamePasskeyForm } from './rename-passkey-form'

export const PasskeyRow = ({
  createdAt,
  id,
  name,
  onChange,
}: Pick<Passkey, 'createdAt' | 'id' | 'name'> & { onChange: () => void }) => {
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
    onError: (error) => handleError(error),
    onSuccess: () => {
      onChange()
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
          <RenamePasskeyForm
            id={id}
            currentName={name ?? ''}
            onRenamed={() => {
              onChange()
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
