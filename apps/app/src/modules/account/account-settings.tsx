import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { formatDeviceLabel } from '@tamery/shared/device-label'
import { Badge } from '@tamery/ui/components/badge'
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
import { useMutation, useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient, fullSignOut } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'

const SessionRow = ({
  current,
  id,
  ipAddress,
  lastActiveAt,
  onRevoked,
  userAgent,
}: {
  current: boolean
  id: string
  ipAddress: string | null
  lastActiveAt: Date
  onRevoked: () => void
  userAgent: string | null
}) => {
  const { mutate: revoke, isPending } = useMutation(
    orpc.account.revokeSession.mutationOptions({
      meta: { event: 'session_revoked' },
      onSuccess: () => {
        onRevoked()
        toast.success('Session revoked')
      },
    })
  )

  return (
    <SettingsRow
      title={
        <span className="flex items-center gap-2">
          {userAgent ? formatDeviceLabel(userAgent) : 'Unknown device'}
          {current && <Badge variant="secondary">This device</Badge>}
        </span>
      }
      description={
        <>
          {current
            ? 'Active now'
            : `Active ${formatDistanceToNow(lastActiveAt, { addSuffix: true })}`}
          {ipAddress && <span data-mask> · {ipAddress}</span>}
        </>
      }
    >
      {!current && (
        <ConfirmAction
          action="Revoke"
          title="Revoke this session?"
          description="The device is signed out right away."
          isPending={isPending}
          onConfirm={(close) => revoke({ id }, { onSuccess: close })}
        />
      )}
    </SettingsRow>
  )
}

const Sessions = () => {
  const { data: sessions, refetch } = useQuery(
    orpc.account.sessions.queryOptions()
  )
  const { mutate: revokeOthers, isPending } = useMutation({
    meta: { event: 'other_sessions_revoked' },
    mutationFn: () =>
      authClient.revokeOtherSessions({ fetchOptions: { throw: true } }),
    onError: (error) => handleError(error),
    onSuccess: () => {
      void refetch()
      toast.success('All other sessions have been revoked')
    },
  })

  if (!sessions) {
    return null
  }

  return (
    <SettingsGroup title="Sessions">
      {sessions.map((session) => (
        <SessionRow key={session.id} {...session} onRevoked={refetch} />
      ))}
      {sessions.some((session) => !session.current) && (
        <SettingsRow
          title="Sign out other devices"
          description="Every session except this one ends right away."
        >
          <ConfirmAction
            action="Revoke all"
            title="Revoke all other sessions?"
            description="Every device except this one is signed out right away."
            isPending={isPending}
            onConfirm={(close) => revokeOthers(undefined, { onSuccess: close })}
          />
        </SettingsRow>
      )}
    </SettingsGroup>
  )
}

const DeleteAccount = () => {
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

export const AccountSettings = () => (
  <>
    <Sessions />
    <DeleteAccount />
  </>
)
