import type { Passkey } from '@better-auth/passkey/client'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'

export const PasskeyItem = ({
  id,
  name,
  createdAt,
  refetchPasskeys,
}: Pick<Passkey, 'createdAt' | 'id' | 'name'> & {
  refetchPasskeys: () => void
}) => {
  const { mutate: deletePasskey, isPending } = useMutation({
    meta: { event: 'passkey_deleted' },
    mutationFn: () =>
      authClient.passkey.deletePasskey({ fetchOptions: { throw: true }, id }),
    onError: handleError,
    onSuccess: () => {
      refetchPasskeys()
      toast.success('Passkey deleted')
    },
  })

  return (
    <SettingsRow
      title={name || 'Passkey'}
      description={`Added ${format(createdAt, 'PP')}`}
    >
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
