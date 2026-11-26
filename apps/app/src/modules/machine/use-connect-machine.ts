import { challenge } from '@tamery/shared/challenge'
import { machineKey } from '@tamery/shared/machine'
import { useIsMutating, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { connectMachineMutation } from './connect-machine'

/** Connects this browser to a machine the account lists, at whichever of its URLs answers. */
export const useConnectMachine = ({
  machineId,
  urls,
}: {
  machineId: string
  urls: string[]
}) => {
  const options = connectMachineMutation(machineId, urls)
  const isPending = useIsMutating({ mutationKey: options.mutationKey }) > 0
  const {
    error,
    isPending: isOwn,
    mutate,
    variables,
  } = useMutation({
    ...options,
    onSuccess: () => toast.success('Machine connected'),
  })
  return {
    code: isOwn ? challenge.getUserCode(variables) : null,
    connect: () => mutate(machineKey.nonce()),
    error,
    isPending,
  }
}
