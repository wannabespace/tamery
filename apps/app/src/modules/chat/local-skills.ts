import { useQuery } from '@tanstack/react-query'

import { useLocalMachine } from '~/core/local-machine'
import { useConnectionRunsOn } from '~/core/runtime/machine/pairing'

/** The user's skills on the computer a connection runs on, for the `/` menu. */
export const useLocalSkills = (connectionId: string) => {
  const machine = useLocalMachine(useConnectionRunsOn(connectionId))
  const { data = null } = useQuery({
    enabled: !!machine,
    queryFn: () => machine?.listSkills() ?? null,
    queryKey: [...(machine?.queryKey ?? []), 'skills'],
    staleTime: 30_000,
  })
  return data?.state === 'listed' ? data.skills : []
}
