import { ComputerIcon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import type { ReactNode } from 'react'

import { Link } from '~/components/link'
import { setBridgeEnabled } from '~/core/runtime/bridge/pairing'
import type { BridgeError } from '~/core/runtime/bridge/status'

export const BridgeFailure = ({
  error: { bridgeName, status },
  retry,
}: {
  error: BridgeError
  retry: () => void
}) => {
  const name = <span data-mask>{bridgeName}</span>

  let title = 'The bridge isn’t running'
  let description: ReactNode = <>Start it on {name}, then try again.</>
  let way: ReactNode = (
    <Button
      variant="outline"
      onClick={() => {
        setBridgeEnabled(false)
        retry()
      }}
    >
      Turn off bridge
    </Button>
  )
  if (status.state === 'outdated') {
    title = 'Update the bridge'
    description = <>This version of Tamery needs a newer bridge on {name}.</>
    way = (
      <Button
        variant="outline"
        render={<Link to="/settings/$section" params={{ section: 'bridge' }} />}
      >
        Bridge settings
      </Button>
    )
  } else if (status.reason === 'denied') {
    title = 'The browser blocks the bridge'
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
