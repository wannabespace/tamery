import { formatDeviceLabel } from '@tamery/shared/device-label'
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
import { Badge } from '@tamery/ui/components/badge'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'

export const SessionItem = ({
  id,
  userAgent,
  ipAddress,
  current,
  refetchSessions,
}: {
  id: string
  userAgent: string | null
  ipAddress: string | null
  current: boolean
  refetchSessions: () => void
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { mutate: revokeSession, isPending: revokingSession } = useMutation(
    orpc.account.revokeSession.mutationOptions({
      meta: { event: 'session_revoked' },
      onSuccess: () => {
        refetchSessions()
        setIsOpen(false)
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
      description={ipAddress && <span data-mask>{ipAddress}</span>}
    >
      {!current && (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
            Revoke
          </AlertDialogTrigger>
          <AlertDialogContent className="sm:max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
              <AlertDialogDescription>
                The device is signed out right away.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="outline" size="default">
                Cancel
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={revokingSession}
                onClick={() => revokeSession({ id })}
              >
                <LoadingContent loading={revokingSession}>
                  Revoke
                </LoadingContent>
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </SettingsRow>
  )
}
