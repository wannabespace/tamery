import { CloudIcon, ComputerIcon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { useSubscription } from 'seitu/react'

import type { AppMenuNode } from '~/components/app-menu'
import { useIsReachableFromWeb } from '~/core/connection/fetching'
import type { RunsOn } from '~/core/runtime/machine/pairing'
import {
  CLOUD,
  machinePairings,
  THIS_COMPUTER,
  useConnectionRunsOn,
  useMachineRouteById,
  useMachines,
  useThisMachineId,
  writeRunsOn,
} from '~/core/runtime/machine/pairing'

import { connectPickedMachine } from './connect-machine'

interface RunsOnOption {
  description: string
  icon: IconSvgElement
  label: string
  value: RunsOn
}

const CLOUD_PLACE = {
  description: 'Tamery’s servers, for public hosts.',
  icon: CloudIcon,
  label: 'Tamery Cloud',
}

const THIS_COMPUTER_PLACE = {
  description: 'The desktop app on this computer.',
  icon: ComputerIcon,
  label: 'This computer',
}

/** Where a connection can run for this user; empty while there is only one place. */
export const useRunsOnOptions = (
  runsOn: RunsOn,
  isReachableFromWeb: boolean
): RunsOnOption[] => {
  const pairings = useSubscription(machinePairings)
  const ownId = useThisMachineId()
  const machines = useMachines().filter(({ id }) => id !== ownId)
  const route = useMachineRouteById(runsOn)
  const isRemoved =
    !!route && !machines.some(({ id }) => id === route.machineId)
  const offersCloud = !window.electron || isReachableFromWeb || runsOn === CLOUD
  const options = [
    ...(window.electron
      ? [{ ...THIS_COMPUTER_PLACE, value: THIS_COMPUTER }]
      : []),
    ...(offersCloud ? [{ ...CLOUD_PLACE, value: CLOUD }] : []),
    ...machines.map(({ id, name }) => ({
      description: pairings[id]
        ? 'Connected to this app.'
        : 'Asks that computer to allow this app.',
      icon: ComputerIcon,
      label: name,
      value: id,
    })),
    ...(isRemoved
      ? [
          {
            description: 'No longer in your account.',
            icon: ComputerIcon,
            label: route.name,
            value: route.machineId,
          },
        ]
      : []),
  ]
  return options.length > 1 ? options : []
}

export const useConnectionRunsOnOptions = (connectionId: string) =>
  useRunsOnOptions(
    useConnectionRunsOn(connectionId),
    useIsReachableFromWeb(connectionId)
  )

export const pickRunsOn = (connectionId: string, runsOn: RunsOn) => {
  writeRunsOn(connectionId, runsOn)
  connectPickedMachine(runsOn)
}

/** Per user, so a workspace member who cannot edit the connection still picks where it runs for them. */
export const useRunsOnMenu = (connectionId: string): AppMenuNode | null => {
  const runsOn = useConnectionRunsOn(connectionId)
  const options = useConnectionRunsOnOptions(connectionId)
  if (options.length === 0) {
    return null
  }
  return {
    icon: ComputerIcon,
    items: [
      {
        onValueChange: (value) => pickRunsOn(connectionId, value),
        options: options.map(({ icon, label, value }) => ({
          icon,
          label,
          value,
        })),
        type: 'radio',
        value: runsOn,
      },
    ],
    label: 'Runs on',
    type: 'sub',
  }
}
