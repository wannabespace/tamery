import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { DialogFooter } from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

export const RenamePasskeyForm = ({
  currentName,
  id,
  onRenamed,
}: {
  currentName: string
  id: string
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
    onError: (error) => handleError(error),
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
