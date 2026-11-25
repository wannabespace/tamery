import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { MACHINE_INSTALL_COMMANDS } from '@tamery/shared/machine'
import { Button } from '@tamery/ui/components/button'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { formatDistanceStrict } from 'date-fns'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { mutateOffline, useCollections } from '~/core/collections'
import { FetchingReason } from '~/core/connection/fetching-reason'
import { machine } from '~/core/runtime/machine/machine'
import type { MachinePairing } from '~/core/runtime/machine/pairing'
import {
  getMachineStatusMessage,
  useMachineStatus,
} from '~/core/runtime/machine/status'
import { posthog } from '~/lib/posthog'

import { OnlineStatus } from './online-status'
import { useConnectMachine } from './use-connect-machine'

/** A machine that registered within this long reads as running to a browser not paired with it. */
const RUNNING_WITHIN_MS = 10 * 60 * 1000
const CLOCK_MS = 60 * 1000

export interface ListedMachine {
  id: string
  /** `false` for a pairing whose machine was removed from the account: no connection runs on it. */
  isListed: boolean
  name: string
  seenAt: Date | null
  urls: string[]
}

const UnpairedStatus = ({
  code,
  seenAt,
}: {
  code: string | null
  seenAt: Date | null
}) => {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(clock)
  }, [])
  if (code) {
    return (
      <>
        Allow this browser on that computer only if it shows{' '}
        <InlineCode>{code}</InlineCode>.
      </>
    )
  }
  if (!seenAt) {
    return 'Not connected.'
  }
  return now - seenAt.getTime() < RUNNING_WITHIN_MS
    ? 'Running. Choose it under Runs on in a connection.'
    : `Last seen ${formatDistanceStrict(seenAt, now, { addSuffix: true })}.`
}

export const MachineRow = ({
  listed,
  pairing,
}: {
  listed: ListedMachine
  pairing: MachinePairing | null
}) => {
  const { machinesCollection } = useCollections()
  const status = useMachineStatus(pairing)
  const connect = useConnectMachine({
    machineId: listed.id,
    urls: listed.urls,
  })
  const info = status && 'info' in status ? status.info : null
  const name = <span data-mask>{listed.name}</span>

  let description: ReactNode = (
    <UnpairedStatus code={connect.code} seenAt={listed.seenAt} />
  )
  if (connect.error) {
    description = <FetchingReason reason={connect.error.message} />
  } else if (pairing && !listed.isListed) {
    description =
      'Not listed in your account, so no connection runs on it. Check that it is online and signed in to this account.'
  } else if (pairing) {
    description =
      status?.state === 'connected' ? (
        <OnlineStatus>Connected</OnlineStatus>
      ) : (
        <FetchingReason
          reason={status ? getMachineStatusMessage(status) : 'Checking…'}
        />
      )
  }

  const remove = async () => {
    if (pairing) {
      await machine.unpair(pairing)
    }
    if (listed.isListed) {
      mutateOffline(() => machinesCollection.delete(listed.id))
    }
    posthog.capture('machine_removed')
  }

  return (
    <>
      <SettingsRow
        // A title is a flex row: one span keeps the version in the sentence.
        title={
          <span>
            {name}
            {info && (
              <span className="text-muted-foreground"> {info.version}</span>
            )}
          </span>
        }
        description={description}
      >
        {pairing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => machine.unpair(pairing)}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={connect.isPending || listed.urls.length === 0}
            onClick={() => connect.connect()}
          >
            <LoadingContent loading={connect.isPending}>Connect</LoadingContent>
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-destructive"
                aria-label="Remove"
                onClick={remove}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            }
          />
          <TooltipContent>
            Remove. A machine that still runs shows up again.
          </TooltipContent>
        </Tooltip>
      </SettingsRow>
      {info && (info.latestVersion || status?.state === 'outdated') && (
        <SettingsRow
          title={
            info.latestVersion
              ? `Update available: ${info.latestVersion}`
              : 'Update required'
          }
          description={<>Update the machine on {name}, then restart it.</>}
        >
          <CopyButton
            variant="outline"
            size="sm"
            text={MACHINE_INSTALL_COMMANDS[info.installer]}
            onClick={() =>
              posthog.capture('machine_command_copied', { copied: 'update' })
            }
          >
            Copy command
          </CopyButton>
        </SettingsRow>
      )}
    </>
  )
}
