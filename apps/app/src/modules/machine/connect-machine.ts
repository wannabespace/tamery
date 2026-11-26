import { challenge } from '@tamery/shared/challenge'
import { machineKey } from '@tamery/shared/machine'
import { mutationOptions } from '@tanstack/react-query'
import { toast } from 'sonner'

import { getCollections } from '~/core/collections'
import { machine } from '~/core/runtime/machine/machine'
import type { RunsOn } from '~/core/runtime/machine/pairing'
import { getMachineRouteById } from '~/core/runtime/machine/pairing'
import { queryClient } from '~/lib/query-client'

/** The key is shared, so a machine already asked from one place is not asked again from another. */
export const connectMachineMutation = (machineId: string, urls: string[]) =>
  mutationOptions({
    meta: { event: 'machine_paired' },
    mutationFn: (browserNonce: string) =>
      machine.pair({ browserNonce, machineId, urls }),
    mutationKey: ['connect-machine', machineId],
  })

/** Call only from the user's own pick in Runs on: it contacts the machine, which can raise a Local Network Access prompt. */
export const connectPickedMachine = (runsOn: RunsOn) => {
  const route = getMachineRouteById(runsOn)
  if (!route || route.pairing) {
    return
  }
  const mutation = connectMachineMutation(
    route.machineId,
    getCollections().machinesCollection.get(route.machineId)?.urls ?? []
  )
  if (queryClient.isMutating({ mutationKey: mutation.mutationKey }) > 0) {
    return
  }
  const browserNonce = machineKey.nonce()
  toast.promise(
    queryClient
      .getMutationCache()
      .build(queryClient, mutation)
      .execute(browserNonce),
    {
      error: (error: Error) => error.message,
      loading: `Allow this app on that computer only if it shows ${challenge.getUserCode(browserNonce)}.`,
      success: 'Machine connected',
    }
  )
}
