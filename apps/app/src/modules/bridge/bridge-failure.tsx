import { ComputerIcon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { Link } from '~/components/link'
import type { BridgeError } from '~/core/runtime/bridge/bridge'
import { setBridgeEnabled } from '~/core/runtime/bridge/pairing'
import { posthog } from '~/lib/posthog'

/** A paired bridge that cannot answer is a state to get out of, not a crash: the reason and the ways out. */
export const BridgeFailure = ({
  error: { bridgeName, status },
  reset,
}: {
  error: BridgeError
  reset: () => void
}) => {
  const queryErrors = useQueryErrorResetBoundary()
  const retry = () => {
    // A failed query stays failed for an error boundary until its reset boundary lets it retry on mount.
    queryErrors.reset()
    reset()
  }
  const name = <span data-mask>{bridgeName}</span>

  let title = 'The bridge isn’t running'
  let description: ReactNode = <>Start it on {name}, then try again.</>
  let way: ReactNode = (
    <Button
      variant="outline"
      onClick={() => {
        setBridgeEnabled(false)
        posthog.capture('bridge_toggled', { enabled: false })
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
