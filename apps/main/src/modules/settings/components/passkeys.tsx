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
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  queryOptions,
  useMutation,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

// A dismissed or timed-out browser prompt reports NotAllowedError, which arrives as the passthrough code.
const DISMISSED_CODES = new Set([
  'ERROR_CEREMONY_ABORTED',
  'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
])

export const passkeysQueryOptions = queryOptions({
  queryFn: () =>
    authClient.passkey.listUserPasskeys({ fetchOptions: { throw: true } }),
  queryKey: ['passkeys'],
})

const PasskeyItem = ({
  id,
  name,
  createdAt,
  refetchPasskeys,
}: {
  id: string
  name?: string
  createdAt: Date
  refetchPasskeys: () => void
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { mutate: deletePasskey, isPending } = useMutation({
    meta: { event: 'passkey_deleted' },
    mutationFn: () =>
      authClient.passkey.deletePasskey({ fetchOptions: { throw: true }, id }),
    onError: handleError,
    onSuccess: () => {
      refetchPasskeys()
      setIsOpen(false)
      toast.success('Passkey deleted')
    },
  })

  return (
    <SettingsRow
      title={name || 'Passkey'}
      description={`Added ${format(createdAt, 'PP')}`}
    >
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              You can no longer sign in with it. Remove it from your password
              manager too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => deletePasskey()}
            >
              <LoadingContent loading={isPending}>Delete</LoadingContent>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsRow>
  )
}

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
      if (error.code === 'SESSION_NOT_FRESH') {
        toast.error('Sign in again to add a passkey.')
      } else if (!DISMISSED_CODES.has(error.code ?? '')) {
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
