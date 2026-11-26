import { eq, useLiveQuery } from '@tanstack/react-db'
import { useParams } from '@tanstack/react-router'

import { useCollections } from '~/core/collections'

/** The connection this page has open, for chrome outside its route. */
export const useOpenConnectionId = () => {
  const { resourceId } = useParams({ strict: false })
  const { connectionsResourcesCollection } = useCollections()
  const { data: resource } = useLiveQuery(
    (q) =>
      resourceId
        ? q
            .from({ r: connectionsResourcesCollection })
            .where(({ r }) => eq(r.id, resourceId))
            .findOne()
        : null,
    [resourceId]
  )
  return resource?.connectionId ?? null
}
