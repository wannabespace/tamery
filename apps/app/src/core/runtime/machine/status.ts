import type { InferClientOutputs } from '@orpc/client'
import type { MachineRouter } from '@tamery/cli/src/machine/router'
import { machineKey, MIN_MACHINE_PROTOCOL } from '@tamery/shared/machine'
import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'
import { Result } from 'better-result'
import { toast } from 'sonner'

import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import { getMachineClient, isLoopbackUrl } from './client'
import type { MachinePairing } from './pairing'
import {
  clearMachinePairing,
  MACHINE_QUERY_KEY,
  machinePairings,
} from './pairing'

const MACHINE_CHECK_INTERVAL = 10_000

type MachineInfo = InferClientOutputs<MachineRouter>['machine']['pair']['info']

type MachineTrouble =
  | { info: MachineInfo; state: 'outdated' }
  | { reason: 'denied' | 'stopped'; state: 'unreachable' }

export type MachineStatus =
  | { info: MachineInfo; state: 'connected' }
  | MachineTrouble

const reported = new Set<'machine_outdated' | 'machine_unreachable'>()

const reportOnce = (event: 'machine_outdated' | 'machine_unreachable') => {
  if (!reported.has(event)) {
    reported.add(event)
    posthog.capture(event)
  }
}

/** Without the machine's name, which the UI shows masked beside it. */
export const getMachineStatusMessage = (status: MachineStatus) => {
  if (status.state === 'connected') {
    return 'Connected.'
  }
  if (status.state === 'outdated') {
    return 'Update the machine to run queries.'
  }
  if (status.reason === 'denied') {
    return 'This browser blocks Tamery from reaching it. Allow local network access for this site in the browser’s settings.'
  }
  return 'Not running. Start `tamery machine` or the desktop app there.'
}

export class MachineError extends Error {
  readonly machineName: string
  readonly status: MachineTrouble

  constructor(status: MachineTrouble, machineName: string) {
    super(`${machineName}: ${getMachineStatusMessage(status)}`)
    this.name = 'MachineError'
    this.machineName = machineName
    this.status = status
  }
}

export const toStatus = (info: MachineInfo): MachineStatus => {
  if (info.protocol >= MIN_MACHINE_PROTOCOL) {
    return { info, state: 'connected' }
  }
  reportOnce('machine_outdated')
  return { info, state: 'outdated' }
}

const toUnreachable = async (
  pairing: MachinePairing
): Promise<MachineStatus> => {
  reportOnce('machine_unreachable')
  const answers = isLoopbackUrl(pairing.url)
    ? await Promise.allSettled(
        ['loopback-network', 'local-network'].map((name) =>
          // Neither name is a `PermissionName` in the DOM typings yet; a browser that does not know one rejects it.
          navigator.permissions.query({ name: name as PermissionName })
        )
      )
    : []
  const known = answers.find((answer) => answer.status === 'fulfilled')
  const denied = known?.status === 'fulfilled' && known.value.state === 'denied'
  return { reason: denied ? 'denied' : 'stopped', state: 'unreachable' }
}

export const forget = (pairing: MachinePairing) => {
  const message = `The machine on ${pairing.name} no longer knows this browser. Connect again from Settings → Machines.`
  // A late answer for a pairing this browser already replaced must not clear the new one.
  if (machinePairings.get()[pairing.machineId]?.secret === pairing.secret) {
    clearMachinePairing(pairing)
    toast.error(message, { id: 'machine-forgotten' })
  }
  return new Error(message)
}

const check = async (pairing: MachinePairing) => {
  const nonce = machineKey.nonce()
  const hello = await Result.tryPromise(() =>
    getMachineClient(pairing.url).machine.hello({
      browserId: pairing.browserId,
      nonce,
    })
  )
  if (hello.isErr()) {
    return toUnreachable(pairing)
  }
  const { proof, ...info } = hello.value
  if (proof === null) {
    throw forget(pairing)
  }
  // Another process took the port: whatever it is, it is not the machine this browser paired with.
  if (proof !== machineKey.proof(machineKey.hash(pairing.secret), nonce)) {
    return toUnreachable(pairing)
  }
  return toStatus(info)
}

export const statusQueryOptions = (pairing: MachinePairing | null) =>
  queryOptions({
    queryFn: pairing ? () => check(pairing) : skipToken,
    queryKey: [MACHINE_QUERY_KEY, pairing?.browserId ?? null],
    refetchInterval: ({ state: { data } }) =>
      data?.state === 'unreachable' && data.reason === 'denied'
        ? false
        : MACHINE_CHECK_INTERVAL,
    refetchOnWindowFocus: 'always',
    staleTime: 0,
    throwOnError: false,
  })

export const useMachineStatus = (pairing: MachinePairing | null) =>
  useQuery(statusQueryOptions(pairing)).data ?? null

/**
 * Every call asks `hello` first, never a cached answer: the machine may have stopped since and another process taken its port,
 * which must not receive the secret. Calls made together share one `hello`.
 */
export const ensureConnected = async (pairing: MachinePairing) => {
  const status = await queryClient.query(statusQueryOptions(pairing))
  if (status.state !== 'connected') {
    throw new MachineError(status, pairing.name)
  }
}
