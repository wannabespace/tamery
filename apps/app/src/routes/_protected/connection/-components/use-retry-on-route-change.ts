import { useEffect, useEffectEvent } from 'react'

import { getCollections } from '~/core/collections'
import { useConnectionParams } from '~/core/connection/route'
import {
  getConnectionRunsOn,
  getMachineRoute,
  machinePairings,
} from '~/core/runtime/machine/pairing'

/** The title bar stays usable over a failed connection: picking another place to run it, or connecting its machine, outdates the error. */
export const useRetryOnRouteChange = (retry: () => void) => {
  const { resourceId } = useConnectionParams()
  const onRouteChange = useEffectEvent(retry)
  useEffect(() => {
    const { connectionMachinesCollection, connectionsResourcesCollection } =
      getCollections()
    const getRouteKey = () => {
      const connectionId =
        connectionsResourcesCollection.get(resourceId)?.connectionId
      return (
        connectionId &&
        `${getConnectionRunsOn(connectionId)} ${getMachineRoute(connectionId)?.pairing?.browserId}`
      )
    }
    const failedOn = getRouteKey()
    const retryIfChanged = () => {
      if (getRouteKey() !== failedOn) {
        onRouteChange()
      }
    }
    const rows = connectionMachinesCollection.subscribeChanges(retryIfChanged)
    const unsubscribe = machinePairings.subscribe(retryIfChanged)
    return () => {
      rows.unsubscribe()
      unsubscribe()
    }
  }, [resourceId])
}
