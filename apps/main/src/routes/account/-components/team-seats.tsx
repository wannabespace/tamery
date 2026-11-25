import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'
import { ConfirmAction } from '~/modules/settings/components/confirm-action'

const { useRouteContext } = getRouteApi('/account')

export const TeamSeats = ({
  assignableSeats,
  isChangingSeats,
  isOpeningPortal,
  isTrial,
  onChangeSeats,
  seats,
}: {
  assignableSeats: number
  isChangingSeats: boolean
  isOpeningPortal: boolean
  isTrial: boolean
  onChangeSeats: () => void
  seats: number
}) => {
  const { user } = useRouteContext()
  const {
    data: assigned,
    isError,
    refetch,
  } = useQuery(orpc.account.subscription.seats.list.queryOptions())
  const [email, setEmail] = useState('')

  const { mutate: assign, isPending: isAssigning } = useMutation(
    orpc.account.subscription.seats.add.mutationOptions({
      meta: { event: 'team_seat_assigned' },
      onSettled: () => refetch(),
      onSuccess: ({ alreadyAssigned, emailed }) => {
        setEmail('')
        if (alreadyAssigned) {
          toast.info('This email already has a seat')
        } else if (emailed) {
          toast.success('Seat assigned')
        } else {
          toast.warning(
            "Seat assigned, but the email didn't go out. Ask them to sign in with this address."
          )
        }
      },
    })
  )
  const {
    mutate: remove,
    isPending: isRemoving,
    variables: removing,
  } = useMutation(
    orpc.account.subscription.seats.remove.mutationOptions({
      meta: { event: 'team_seat_removed' },
      onSettled: () => refetch(),
    })
  )

  if (isError) {
    return (
      <SettingsGroup title="Seats">
        <SettingsRow title="Seats didn't load">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </SettingsRow>
      </SettingsGroup>
    )
  }

  return (
    <SettingsGroup title="Seats">
      <SettingsRow
        title={`${(assigned?.length ?? 0) + 1} of ${seats} used`}
        description={
          isTrial
            ? 'During the trial you can give one seat. The rest open once your plan is paid.'
            : 'If you lower the count, the people you added last lose their seats.'
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={isOpeningPortal}
          onClick={onChangeSeats}
        >
          <LoadingContent loading={isChangingSeats}>
            Change seats
          </LoadingContent>
        </Button>
      </SettingsRow>
      <SettingsRow title={<span data-mask>{user.email}</span>}>
        <span className="text-muted-foreground text-xs">You</span>
      </SettingsRow>
      {assigned?.map((seat) => (
        <SettingsRow key={seat.id} title={<span data-mask>{seat.email}</span>}>
          <ConfirmAction
            action="Remove"
            title={`Remove ${seat.email}?`}
            description="They lose the Pro features this Team gives them right away."
            isPending={isRemoving && removing?.id === seat.id}
            onConfirm={(close) => remove({ id: seat.id }, { onSuccess: close })}
          />
        </SettingsRow>
      ))}
      {assigned && assigned.length < assignableSeats && (
        <SettingsRow
          title="Assign a seat"
          description="They get an email and sign in with this address."
        >
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              assign({ email })
            }}
          >
            <Input
              required
              type="email"
              aria-label="Email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-mask
            />
            <Button type="submit" disabled={!email.trim() || isAssigning}>
              <LoadingContent loading={isAssigning}>Assign</LoadingContent>
            </Button>
          </form>
        </SettingsRow>
      )}
    </SettingsGroup>
  )
}
