import { ComputerIcon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'

import { Link } from '~/components/link'
import { FetchingReason } from '~/core/connection/fetching-reason'
import type { MachineRoute } from '~/core/runtime/machine/pairing'
import { useMachines } from '~/core/runtime/machine/pairing'

import { useConnectMachine } from './use-connect-machine'

export const MachineNotPaired = ({
  retry,
  route,
}: {
  retry?: () => void
  route: MachineRoute
}) => {
  const listed = useMachines().find(({ id }) => id === route.machineId)
  const connect = useConnectMachine({
    machineId: route.machineId,
    onConnected: retry,
    urls: listed?.urls ?? [],
  })
  const name = <span data-mask>{route.name}</span>

  let description = (
    <>Connect this browser to {name} to run this connection’s queries there.</>
  )
  if (connect.error) {
    description = <FetchingReason reason={connect.error.message} />
  } else if (connect.code) {
    description = (
      <>
        Allow this browser on {name} only if it shows{' '}
        <InlineCode>{connect.code}</InlineCode>.
      </>
    )
  } else if (!listed) {
    description = (
      <>
        {name} is no longer in your account. Pick where it runs from the
        connection’s menu, under Runs on.
      </>
    )
  }

  return (
    <div className="flex h-screen min-h-[inherit] flex-col">
      <IconEmpty
        icon={ComputerIcon}
        title={<>Runs on {name}</>}
        description={description}
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={
              <Link to="/settings/$section" params={{ section: 'machines' }} />
            }
          >
            Machines
          </Button>
          <Button
            disabled={connect.isPending || !listed}
            onClick={() => connect.connect()}
          >
            <LoadingContent loading={connect.isPending}>Connect</LoadingContent>
          </Button>
        </div>
      </IconEmpty>
    </div>
  )
}
