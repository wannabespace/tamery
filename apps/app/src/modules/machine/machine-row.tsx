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
import { useState } from 'react'

import { mutateOffline, useCollections } from '~/core/collections'
import { FetchingReason } from '~/core/connection/fetching-reason'
import { machine } from '~/core/runtime/machine/machine'
import type { MachinePairing } from '~/core/runtime/machine/pairing'
import {
  getMachineStatusMessage,
  useMachineStatus,
} from '~/core/runtime/machine/status'
import { posthog } from '~/lib/posthog'

import { useConnectMachine } from './use-connect-machine'

/** A machine that registered within this long reads as running to a browser not paired with it. */
const RUNNING_WITHIN_MS = 10 * 60 * 1000

export interface ListedMachine {
  id: string
  name: string
  /** `null` for a pairing whose machine the account does not list, such as one reached only by its URL. */
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
  // oxlint-disable-next-line react/hook-use-state -- the clock "Last seen" reads from, frozen at mount so render stays pure
  const [now] = useState(Date.now)
  if (code) {
    return (
      <>
        Allow this browser in the terminal running{' '}
        <InlineCode>tamery machine</InlineCode> only if it shows{' '}
        <InlineCode>{code}</InlineCode>.
      </>
    )
  }
  if (!seenAt) {
    return 'Not connected.'
  }
  return now - seenAt.getTime() < RUNNING_WITHIN_MS
    ? 'Running. Connect this browser to run queries on it.'
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
  } else if (pairing) {
    description =
      status?.state === 'connected' ? (
        <span className="flex items-center gap-2">
          <span className="bg-success size-1.5 rounded-full" />
          Connected
        </span>
      ) : (
        <FetchingReason
          reason={
            status ? getMachineStatusMessage(status, listed.name) : 'Checking…'
          }
        />
      )
  }

  const remove = async () => {
    if (pairing) {
      await machine.unpair(pairing)
    }
    if (listed.seenAt) {
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
