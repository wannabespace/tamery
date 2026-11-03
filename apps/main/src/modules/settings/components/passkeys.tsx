import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  queryOptions,
  useMutation,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { toast } from 'sonner'

import { authClient, isPasskeyPromptDismissed } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { PasskeyItem } from './passkey-item'

export const passkeysQueryOptions = queryOptions({
  queryFn: () =>
    authClient.passkey.listUserPasskeys({ fetchOptions: { throw: true } }),
  queryKey: ['passkeys'],
})

export const PasskeysSettings = () => {
  const { data: passkeys, refetch: refetchPasskeys } =
    useSuspenseQuery(passkeysQueryOptions)

  const { mutate: addPasskey, isPending } = useMutation({
    meta: { event: 'passkey_added' },
    mutationFn: async () => {
      const { error } = await authClient.passkey.addPasskey()

      if (error) {
        throw error
      }
    },
    onError: (error: { code?: string }) => {
      if (error.code === authClient.$ERROR_CODES.SESSION_NOT_FRESH.code) {
        toast.error('Sign in again to add a passkey.')
      } else if (!isPasskeyPromptDismissed(error)) {
        void handleError(error)
      }
    },
    onSuccess: () => {
      refetchPasskeys()
      toast.success('Passkey added')
    },
  })

  return (
    <SettingsGroup title="Passkeys">
      {passkeys.map((passkey) => (
        <PasskeyItem
          key={passkey.id}
          {...passkey}
          refetchPasskeys={refetchPasskeys}
        />
      ))}
      <SettingsRow
        title="Add a passkey"
        description="Sign in with your fingerprint, face or device PIN instead of an email code."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => addPasskey()}
          disabled={isPending}
        >
          <LoadingContent loading={isPending}>Add</LoadingContent>
        </Button>
      </SettingsRow>
    </SettingsGroup>
  )
}
