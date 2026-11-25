import { UserRemove01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'

const { useRouteContext } = getRouteApi('/account')

export const TeamSeats = ({
  isChangingSeats,
  onChangeSeats,
  seats,
}: {
  isChangingSeats: boolean
  onChangeSeats: () => void
  seats: number
}) => {
  const { user } = useRouteContext()
  const { data: assigned, refetch } = useSuspenseQuery(
    orpc.account.subscription.seats.list.queryOptions()
  )
  const [email, setEmail] = useState('')
  const usedSeats = assigned.length + 1

  const { mutate: assign, isPending: isAssigning } = useMutation(
    orpc.account.subscription.seats.add.mutationOptions({
      meta: { event: 'team_seat_assigned' },
      onSettled: () => refetch(),
      onSuccess: () => {
        setEmail('')
        toast.success('Seat assigned')
      },
    })
  )
  const { mutate: remove, isPending: isRemoving } = useMutation(
    orpc.account.subscription.seats.remove.mutationOptions({
      meta: { event: 'team_seat_removed' },
      onSettled: () => refetch(),
    })
  )

  return (
    <SettingsGroup title="Seats">
      <SettingsRow
        title={`${usedSeats} of ${seats} used`}
        description="If you lower the count, the people you added last lose their seats."
      >
        <Button
          variant="outline"
          size="sm"
          disabled={isChangingSeats}
          onClick={onChangeSeats}
        >
          Change seats
        </Button>
      </SettingsRow>
      <SettingsRow title={<span data-mask>{user.email}</span>}>
        <span className="text-muted-foreground text-xs">You</span>
      </SettingsRow>
      {assigned.map((seat) => (
        <SettingsRow key={seat.id} title={<span data-mask>{seat.email}</span>}>
          <IconButton
            icon={UserRemove01Icon}
            label="Remove from team"
            size="icon-xs"
            variant="ghost-destructive"
            disabled={isRemoving}
            onClick={() => remove({ id: seat.id })}
          />
        </SettingsRow>
      ))}
      {usedSeats < seats && (
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
