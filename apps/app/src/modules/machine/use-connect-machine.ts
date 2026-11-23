import { challenge } from '@tamery/shared/challenge'
import { machineKey } from '@tamery/shared/machine'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { machine } from '~/core/runtime/machine/machine'

/** Connects this browser to a machine the account lists, at whichever of its URLs answers. */
export const useConnectMachine = ({
  machineId,
  onConnected,
  urls,
}: {
  machineId: string
  onConnected?: () => void
  urls: string[]
}) => {
  const { error, isPending, mutate, variables } = useMutation({
    meta: { event: 'machine_paired' },
    mutationFn: (browserNonce: string) =>
      machine.pair({ browserNonce, machineId, urls }),
    onSuccess: () => {
      toast.success('Machine connected')
      onConnected?.()
    },
  })
  return {
    code: isPending && variables ? challenge.getUserCode(variables) : null,
    connect: () => mutate(machineKey.nonce()),
    error,
    isPending,
  }
}
