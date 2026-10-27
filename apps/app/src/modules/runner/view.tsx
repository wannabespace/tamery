import { useTabContext } from '~/core/connection/route'

import { Runner } from './components/runner'
import { RunnerTabContext } from './lib/store'

const RunnerTab = ({ id: tabId }: { id: string }) => {
  const { connectionResource } = useTabContext()

  return (
    <RunnerTabContext value={{ resourceId: connectionResource.id, tabId }}>
      <Runner />
    </RunnerTabContext>
  )
}

export const runnerView = { Content: RunnerTab }
