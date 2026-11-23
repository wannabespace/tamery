import { ComputerIcon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import type { ReactNode } from 'react'

import { Link } from '~/components/link'
import type { MachineError } from '~/core/runtime/machine/status'

export const MachineFailure = ({
  error: { machineName, status },
  retry,
}: {
  error: MachineError
  retry: () => void
}) => {
  const name = <span data-mask>{machineName}</span>

  let title = 'The machine isn’t running'
  let description: ReactNode = <>Start it on {name}, then try again.</>
  let way: ReactNode = (
    <Button
      variant="outline"
      render={<Link to="/settings/$section" params={{ section: 'machines' }} />}
    >
      Machines
    </Button>
  )
  if (status.state === 'outdated') {
    title = 'Update the machine'
    description = <>This version of Tamery needs a newer machine on {name}.</>
  } else if (status.reason === 'denied') {
    title = 'The browser blocks the machine'
    description =
      'Allow local network access for this site in your browser’s settings.'
    way = null
  }

  return (
    <div className="flex h-screen min-h-[inherit] flex-col">
      <IconEmpty icon={ComputerIcon} title={title} description={description}>
        <div className="flex gap-2">
          {way}
          <Button onClick={retry}>Try again</Button>
        </div>
      </IconEmpty>
    </div>
  )
}
